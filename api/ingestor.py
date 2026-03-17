"""
GraphIQ — Document Ingestion Pipeline
Place this file at: GRAPHIQ/api/ingestor.py
"""

import os
import re
import pdfplumber
from pathlib import Path
from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

# ── Neo4j connection ─────────────────────────────────────────────────────────

class Neo4jConnection:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            os.getenv("NEO4J_URI", "bolt://localhost:7687"),
            auth=(
                os.getenv("NEO4J_USER", "neo4j"),
                os.getenv("NEO4J_PASSWORD", "password"),
            ),
        )

    def close(self):
        self.driver.close()

    def query(self, cypher: str, params: dict = {}):
        with self.driver.session() as session:
            result = session.run(cypher, params)
            return [record.data() for record in result]

    def create_schema(self):
        """Create indexes and constraints in Neo4j."""
        constraints = [
            "CREATE CONSTRAINT entity_name IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE",
        ]
        indexes = [
            "CREATE INDEX entity_type IF NOT EXISTS FOR (e:Entity) ON (e.type)",
        ]
        with self.driver.session() as session:
            for c in constraints:
                try:
                    session.run(c)
                except Exception:
                    pass
            for i in indexes:
                try:
                    session.run(i)
                except Exception:
                    pass
        print("[Neo4j] Schema created.")


# ── Document reader ──────────────────────────────────────────────────────────

def read_pdf(filepath: str) -> list[dict]:
    """Extract text chunks from a PDF file."""
    chunks = []
    with pdfplumber.open(filepath) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            text = page.extract_text()
            if not text:
                continue
            # Split into ~500 char chunks with 50 char overlap
            for chunk in chunk_text(text, chunk_size=500, overlap=50):
                chunks.append({
                    "text": chunk,
                    "source": Path(filepath).name,
                    "page": page_num,
                })
    return chunks


def read_txt(filepath: str) -> list[dict]:
    """Extract text chunks from a plain text file."""
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()
    return [
        {"text": chunk, "source": Path(filepath).name, "page": 1}
        for chunk in chunk_text(text, chunk_size=500, overlap=50)
    ]


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks."""
    text = re.sub(r"\s+", " ", text).strip()
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


def load_document(filepath: str) -> list[dict]:
    """Load any supported document and return chunks."""
    ext = Path(filepath).suffix.lower()
    if ext == ".pdf":
        return read_pdf(filepath)
    elif ext in [".txt", ".csv", ".md"]:
        return read_txt(filepath)
    else:
        print(f"[Ingestor] Unsupported file type: {ext}")
        return []


# ── NLP: entity + relation extraction ───────────────────────────────────────

import spacy

nlp = spacy.load("en_core_web_trf")

ENTITY_TYPE_MAP = {
    "PERSON": "person",
    "ORG":    "organization",
    "GPE":    "location",
    "DATE":   "date",
    "MONEY":  "financial",
    "EVENT":  "event",
    "PRODUCT":"product",
    "LAW":    "legal",
    "WORK_OF_ART": "document",
}


def extract_entities(text: str) -> list[dict]:
    """Extract named entities from text using spaCy."""
    doc = nlp(text)
    seen = set()
    entities = []
    for ent in doc.ents:
        if ent.text.strip() in seen:
            continue
        seen.add(ent.text.strip())
        etype = ENTITY_TYPE_MAP.get(ent.label_, "other")
        entities.append({
            "name":  ent.text.strip(),
            "type":  etype,
            "label": ent.label_,
        })
    return entities


def extract_relations_heuristic(text: str, entities: list[dict]) -> list[dict]:
    """
    Simple co-occurrence + verb-based relation extraction.
    (Phase 5 will replace this with a BERT RE model.)
    """
    doc = nlp(text)
    entity_names = {e["name"] for e in entities}
    relations = []

    for sent in doc.sents:
        sent_text = sent.text
        found = [e for e in entities if e["name"] in sent_text]
        if len(found) < 2:
            continue

        # Find main verb in sentence
        verb = "related_to"
        for token in sent:
            if token.pos_ == "VERB" and token.dep_ in ("ROOT", "relcl", "advcl"):
                verb = token.lemma_.lower().replace(" ", "_")
                break

        # Connect first two entities found in sentence
        head = found[0]
        tail = found[1]
        if head["name"] != tail["name"]:
            relations.append({
                "head":     head["name"],
                "head_type": head["type"],
                "relation": verb[:30],
                "tail":     tail["name"],
                "tail_type": tail["type"],
            })

    return relations


# ── Graph storage ────────────────────────────────────────────────────────────

def store_entities(conn: Neo4jConnection, entities: list[dict], source: str):
    """Upsert entities into Neo4j."""
    for ent in entities:
        conn.query(
            """
            MERGE (e:Entity {name: $name})
            SET e.type = $type,
                e.spacy_label = $label,
                e.source = $source
            """,
            {"name": ent["name"], "type": ent["type"],
             "label": ent["label"], "source": source},
        )


def store_relations(conn: Neo4jConnection, relations: list[dict], source: str):
    """Upsert relationships into Neo4j."""
    for rel in relations:
        rel_type = rel["relation"].upper().replace("-", "_").replace(" ", "_")
        cypher = f"""
            MERGE (a:Entity {{name: $head}})
            SET a.type = $head_type
            MERGE (b:Entity {{name: $tail}})
            SET b.type = $tail_type
            MERGE (a)-[r:{rel_type} {{source: $source}}]->(b)
        """
        conn.query(cypher, {
            "head":      rel["head"],
            "head_type": rel["head_type"],
            "tail":      rel["tail"],
            "tail_type": rel["tail_type"],
            "source":    source,
        })


# ── Main pipeline ────────────────────────────────────────────────────────────

def run_pipeline(filepath: str):
    """Full ingestion pipeline: file → chunks → NLP → Neo4j."""
    print(f"\n[Pipeline] Starting: {filepath}")

    # 1. Load document
    chunks = load_document(filepath)
    print(f"[Ingestor] {len(chunks)} chunks extracted")

    # 2. Connect to Neo4j + create schema
    conn = Neo4jConnection()
    conn.create_schema()

    all_entities = []
    all_relations = []

    # 3. Process each chunk
    for i, chunk in enumerate(chunks):
        print(f"[NLP] Processing chunk {i+1}/{len(chunks)}...", end="\r")
        entities = extract_entities(chunk["text"])
        relations = extract_relations_heuristic(chunk["text"], entities)

        store_entities(conn, entities, chunk["source"])
        store_relations(conn, relations, chunk["source"])

        all_entities.extend(entities)
        all_relations.extend(relations)

    conn.close()

    print(f"\n[Pipeline] Done!")
    print(f"  Entities found  : {len(all_entities)}")
    print(f"  Relations found : {len(all_relations)}")
    print(f"  Neo4j updated   : bolt://localhost:7687")
    return {"entities": len(all_entities), "relations": len(all_relations)}


# ── CLI entry point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python ingestor.py <path_to_document>")
        print("Example: python ingestor.py ../data/report.pdf")
        sys.exit(1)

    path = sys.argv[1]
    if not Path(path).exists():
        print(f"File not found: {path}")
        sys.exit(1)

    result = run_pipeline(path)
    print(f"\nSummary: {result}")