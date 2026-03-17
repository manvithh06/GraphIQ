# GraphIQ — AI-Powered Relational Intelligence System

> Transform unstructured documents into an intelligent, queryable knowledge graph powered by NLP and LLM reasoning.

![GraphIQ](https://img.shields.io/badge/GraphIQ-v1.0-00f5d4?style=for-the-badge&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-a78bfa?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-00f5d4?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Neo4j](https://img.shields.io/badge/Neo4j-5.x-008CC1?style=for-the-badge&logo=neo4j&logoColor=white)

---

## What is GraphIQ?

GraphIQ is an **AI-Powered Knowledge Graph Reasoning Engine** that ingests unstructured enterprise documents and transforms them into a structured, queryable knowledge graph. Users can ask natural language questions and receive intelligent, explainable multi-hop reasoning answers powered by large language models.

### The Problem
Modern enterprises generate massive volumes of unstructured data — reports, contracts, emails, and logs. Extracting meaningful insights from these scattered sources is nearly impossible using traditional keyword search or isolated databases.

### The Solution
GraphIQ automatically:
- Extracts named entities (people, organizations, events, dates)
- Detects relationships between those entities
- Stores everything as a connected knowledge graph in Neo4j
- Enables natural language querying with AI-powered reasoning

---

## Live Demo

```
Ask: "Who detected the data breach and what happened next?"

ANSWER: Priya Nair detected the data breach and reported it to Rahul Sharma.
Rahul Sharma then hired SecureNet LLC to resolve it.

REASONING PATH:
Priya Nair → [detected] → data breach
Priya Nair → [reported_to] → Rahul Sharma
Rahul Sharma → [hired] → SecureNet LLC
SecureNet LLC → [fixed] → data breach

CONFIDENCE: High — all relationships directly stated in the knowledge graph.
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                    │
│           React 18 + Vite + JetBrains Mono              │
│     Physics Graph · Query Engine · Document Manager      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────────┐
│                      API LAYER                          │
│              FastAPI + Uvicorn + Pydantic               │
│         /query  /graph  /ingest  /delete  /sources      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                 INTELLIGENCE CORE                        │
│   spaCy en_core_web_trf  ·  Heuristic Relation          │
│   sentence-transformers  ·  FAISS vector index          │
│   Groq llama-3.3-70b     ·  Hybrid retrieval            │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   STORAGE LAYER                          │
│        Neo4j 5.x Graph DB  ·  FAISS Vector Index        │
│          pdfplumber  ·  PyMuPDF  ·  Text chunking        │
└─────────────────────────────────────────────────────────┘
```

---

## Features

- **Animated Knowledge Graph** — Nodes appear one by one in a physics-based force simulation, showing how the graph builds from your document
- **AI Query Engine** — Ask questions in plain English, get multi-hop reasoning answers with confidence scores
- **Real-time Document Ingestion** — Upload PDFs or text files and watch the graph update instantly
- **Relations Table** — Browse all extracted relationships in a clean tabular view
- **Entity Explorer** — View all extracted entities organized by type
- **Document Manager** — Upload, view, and delete ingested documents
- **NLP Pipeline** — Transformer-based Named Entity Recognition using spaCy
- **Graph Embeddings** — Node2Vec-style semantic embeddings with FAISS vector search

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | React 18 + Vite | Interactive UI |
| Styling | JetBrains Mono + Orbitron | Futuristic dark theme |
| Backend | FastAPI + Uvicorn | REST API |
| NLP | spaCy en_core_web_trf | Named Entity Recognition |
| Relations | Heuristic + verb extraction | Relation detection |
| Graph DB | Neo4j 5.x | Knowledge graph storage |
| Embeddings | sentence-transformers | Semantic node vectors |
| Vector Search | FAISS | Similarity search |
| LLM Reasoning | Groq (llama-3.3-70b) | Natural language answers |
| Containerization | Docker | Neo4j deployment |

---

## Project Structure

```
GraphIQ/
├── api/
│   ├── ingestor.py        # Document ingestion + NLP pipeline
│   ├── main.py            # FastAPI backend + all endpoints
│   └── test_pipeline.py   # Pipeline test suite
├── data/
│   ├── graphiq_synopsis.txt
│   └── techvision_demo.txt
├── frontend/
│   └── src/
│       ├── App.jsx        # Full React UI
│       └── main.jsx
├── notebooks/
│   └── GraphIQ_Notebook.ipynb  # AML project notebook
├── render.yaml            # Render deployment config
└── requirements.txt       # Python dependencies
```

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- Docker Desktop
- Groq API key (free at console.groq.com)

### 1. Clone the repository
```bash
git clone https://github.com/manvithh06/GraphIQ.git
cd GraphIQ
```

### 2. Set up Python environment
```bash
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
python -m spacy download en_core_web_trf
```

### 3. Start Neo4j with Docker
```bash
docker run -d \
  --name neo4j-graphiq \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:5
```

### 4. Configure environment variables
Create `api/.env`:
```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
GROQ_API_KEY=your_groq_key_here
```

### 5. Start the backend
```bash
cd api
uvicorn main:app --reload
```

### 6. Start the frontend
```bash
cd frontend
npm install
npm run dev
```

### 7. Open the app
```
http://localhost:5173
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/` | API info |
| GET | `/health` | Check Neo4j + API status |
| GET | `/graph` | Return full graph as JSON |
| GET | `/sources` | List all ingested files |
| POST | `/query` | AI reasoning over the graph |
| POST | `/ingest` | Upload and ingest a document |
| DELETE | `/delete` | Delete nodes by source file |

---

## How It Works

### 1. Document Ingestion
```
PDF/TXT → chunk_text() → 400-char overlapping chunks
```

### 2. Named Entity Recognition
```
spaCy en_core_web_trf → PERSON, ORG, GPE, DATE, MONEY entities
```

### 3. Relation Extraction
```
Sentence parsing → co-occurring entities → ROOT verb → (head, relation, tail)
```

### 4. Graph Storage
```
Neo4j MERGE → Entity nodes + typed relationship edges
```

### 5. AI Reasoning
```
User query → fetch Neo4j graph → build context → Groq LLM → explainable answer
```

---

## Sample Queries

```
Who manages the Engineering Department?
What happened during the security breach?
Trace the path from Priya Nair to SecureNet LLC
What risks does TechVision Inc face?
Summarize all financial decisions in the graph
Which person has the most connections?
```

---

## Course Details

- **Course**: Advanced Machine Learning (AM2001-1)
- **Institution**: NMAM Institute of Technology
- **Project**: Mini Project — GraphIQ: AI-Powered Relational Intelligence System

---

## References

- T. Mitchell, *Machine Learning*. McGraw-Hill, 1997.
- I. Goodfellow, Y. Bengio, A. Courville, *Deep Learning*. MIT Press, 2016.
- A. Hogan et al., "Knowledge Graphs," *ACM Computing Surveys*, vol. 54, no. 4, 2021.
- Neo4j Documentation — https://neo4j.com/docs/
- spaCy Documentation — https://spacy.io/

---

<p align="center">Built with ❤️ using Python · React · Neo4j · Groq</p>
