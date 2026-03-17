"""
GraphIQ — Pipeline Test
Place this file at: GRAPHIQ/api/test_pipeline.py
Run: python test_pipeline.py
"""

from ingestor import (
    Neo4jConnection,
    extract_entities,
    extract_relations_heuristic,
    run_pipeline,
)


def test_neo4j_connection():
    print("\n--- Test 1: Neo4j connection ---")
    try:
        conn = Neo4jConnection()
        result = conn.query("RETURN 'GraphIQ connected!' AS msg")
        print(result[0]["msg"])
        conn.close()
        print("PASSED")
    except Exception as e:
        print(f"FAILED: {e}")
        print("Make sure Neo4j Docker container is running.")


def test_entity_extraction():
    print("\n--- Test 2: Entity extraction ---")
    sample = (
        "John Smith, CEO of Acme Corp, signed a contract with Supplier XYZ "
        "in January 2025. Sarah Chen from the Finance Department reviewed the deal."
    )
    entities = extract_entities(sample)
    for e in entities:
        print(f"  {e['name']:<20} → {e['type']}")
    print(f"  Total: {len(entities)} entities")
    print("PASSED" if entities else "FAILED — no entities found")


def test_relation_extraction():
    print("\n--- Test 3: Relation extraction ---")
    sample = (
        "John Smith manages the Finance Department at Acme Corp. "
        "Sarah Chen audited the Q3 Report submitted by Supplier XYZ."
    )
    entities = extract_entities(sample)
    relations = extract_relations_heuristic(sample, entities)
    for r in relations:
        print(f"  {r['head']} --[{r['relation']}]--> {r['tail']}")
    print(f"  Total: {len(relations)} relations")
    print("PASSED" if relations else "WARNING — no relations (may vary with model)")


def test_full_pipeline_with_sample_txt():
    print("\n--- Test 4: Full pipeline (sample text file) ---")
    import os

    # Create a small sample document
    sample_path = "../data/sample_test.txt"
    os.makedirs("../data", exist_ok=True)
    with open(sample_path, "w") as f:
        f.write(
            "Acme Corporation is headquartered in New York. "
            "John Smith is the CEO of Acme Corporation and oversees the Finance Department. "
            "Sarah Chen manages IT operations and reports to John Smith. "
            "In March 2025, Acme Corporation signed a supply agreement with Vendor ABC. "
            "The Q3 Compliance Report flagged a Risk Alert involving Supplier XYZ. "
            "Emma Wilson from Legal reviewed the contract with Vendor ABC. "
            "The Board Meeting in April discussed the Risk Alert and approved the Audit Report."
        )

    result = run_pipeline(sample_path)
    print(f"  Entities : {result['entities']}")
    print(f"  Relations: {result['relations']}")
    print("PASSED" if result["entities"] > 0 else "FAILED")


if __name__ == "__main__":
    print("=" * 50)
    print("  GraphIQ Pipeline Test Suite")
    print("=" * 50)

    test_neo4j_connection()
    test_entity_extraction()
    test_relation_extraction()
    test_full_pipeline_with_sample_txt()

    print("\n" + "=" * 50)
    print("  All tests complete.")
    print("  Check Neo4j at: http://localhost:7474")
    print("  Cypher to verify: MATCH (n)-[r]->(m) RETURN n,r,m LIMIT 25")
    print("=" * 50)