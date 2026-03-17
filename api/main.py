"""
GraphIQ — FastAPI Backend (Groq + Delete support)
Place this file at: GRAPHIQ/api/main.py
Run: uvicorn main:app --reload
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from ingestor import Neo4jConnection, run_pipeline

load_dotenv()

app = FastAPI(
    title="GraphIQ API",
    description="AI-Powered Knowledge Graph Reasoning Engine",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

class QueryRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    answer: str
    graph_context: dict

class DeleteRequest(BaseModel):
    source: str  # filename to delete, or "ALL" to wipe everything


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_graph_context(query: str) -> dict:
    conn = Neo4jConnection()
    nodes = conn.query("MATCH (n:Entity) RETURN n.name AS name, n.type AS type")
    edges = conn.query(
        "MATCH (a:Entity)-[r]->(b:Entity) "
        "RETURN a.name AS head, type(r) AS relation, b.name AS tail"
    )
    conn.close()
    return {"nodes": nodes, "edges": edges}


def build_graph_summary(context: dict) -> str:
    nodes_str = ", ".join(f"{n['name']}({n['type']})" for n in context["nodes"])
    edges_str = "; ".join(f"{e['head']}-[{e['relation']}]->{e['tail']}" for e in context["edges"])
    return f"ENTITIES: {nodes_str}\nRELATIONSHIPS: {edges_str}"


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name": "GraphIQ API",
        "version": "1.0.0",
        "status": "running",
        "endpoints": ["/query", "/graph", "/ingest", "/delete", "/sources", "/health"],
    }


@app.get("/health")
def health():
    try:
        conn = Neo4jConnection()
        result = conn.query("RETURN 'ok' AS status")
        conn.close()
        neo4j_status = result[0]["status"]
    except Exception as e:
        neo4j_status = f"error: {str(e)}"
    return {
        "api": "ok",
        "neo4j": neo4j_status,
        "groq_key": "set" if os.getenv("GROQ_API_KEY") else "missing",
    }


@app.get("/graph")
def get_graph():
    try:
        conn = Neo4jConnection()
        nodes = conn.query(
            "MATCH (n:Entity) RETURN n.name AS id, n.name AS label, n.type AS type, n.source AS source"
        )
        edges = conn.query(
            "MATCH (a:Entity)-[r]->(b:Entity) "
            "RETURN a.name AS source, b.name AS target, type(r) AS label"
        )
        conn.close()
        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/sources")
def get_sources():
    """Return list of all ingested source files with node counts."""
    try:
        conn = Neo4jConnection()
        results = conn.query(
            "MATCH (n:Entity) RETURN n.source AS source, count(n) AS node_count "
            "ORDER BY source"
        )
        conn.close()
        # Group by source
        sources = {}
        for r in results:
            src = r["source"] or "unknown"
            sources[src] = sources.get(src, 0) + r["node_count"]
        return {
            "sources": [
                {"filename": k, "nodes": v} for k, v in sources.items()
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query", response_model=QueryResponse)
def query_graph(request: QueryRequest):
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    context = get_graph_context(request.query)
    graph_summary = build_graph_summary(context)

    prompt = f"""You are GraphIQ — an AI-powered knowledge graph reasoning engine.

KNOWLEDGE GRAPH:
{graph_summary}

USER QUERY: "{request.query}"

Respond with:
**ANSWER**
[Direct answer using the graph data]

**REASONING PATH**
[Multi-hop traversal: Entity → [relation] → Entity → [relation] → Entity]

**CONFIDENCE** [High/Medium/Low — one sentence why]

**RELATED INSIGHTS**
[1-2 additional patterns discovered in the graph]

Be concise, specific, and technical."""

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1000,
        )
        answer = response.choices[0].message.content
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Groq API error: {str(e)}")

    return QueryResponse(answer=answer, graph_context=context)


@app.post("/ingest")
async def ingest_document(file: UploadFile = File(...)):
    allowed = [".pdf", ".txt", ".csv", ".md"]
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {allowed}",
        )

    save_dir = Path("../data")
    save_dir.mkdir(exist_ok=True)
    save_path = save_dir / file.filename

    with open(save_path, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        result = run_pipeline(str(save_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}")

    return {
        "status": "success",
        "file": file.filename,
        "entities_found": result["entities"],
        "relations_found": result["relations"],
        "message": f"Successfully ingested {file.filename} into knowledge graph",
    }


@app.delete("/delete")
def delete_source(request: DeleteRequest):
    """
    Delete nodes from the graph by source filename.
    Pass source="ALL" to wipe the entire graph.
    """
    try:
        conn = Neo4jConnection()

        if request.source.upper() == "ALL":
            # Wipe entire graph
            conn.query("MATCH (n) DETACH DELETE n")
            conn.close()
            return {
                "status": "success",
                "message": "Entire graph cleared successfully",
                "deleted_source": "ALL",
            }
        else:
            # Count nodes before deletion
            before = conn.query(
                "MATCH (n {source: $src}) RETURN count(n) AS cnt",
                {"src": request.source}
            )
            count = before[0]["cnt"] if before else 0

            if count == 0:
                conn.close()
                raise HTTPException(
                    status_code=404,
                    detail=f"No nodes found with source: {request.source}"
                )

            # Delete nodes from this source
            conn.query(
                "MATCH (n {source: $src}) DETACH DELETE n",
                {"src": request.source}
            )
            conn.close()

            return {
                "status": "success",
                "message": f"Deleted {count} nodes from '{request.source}'",
                "deleted_source": request.source,
                "nodes_deleted": count,
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))