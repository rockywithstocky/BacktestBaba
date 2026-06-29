import sys
import json
import os
from pathlib import Path

from graphify.detect import detect
from graphify.cache import check_semantic_cache, save_semantic_cache
from graphify.extract import collect_files, extract as ast_extract
from graphify.llm import extract_corpus_parallel
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json

root = Path('.')

# 1. Detect
result = detect(root)
with open('graphify-out/.graphify_detect.json', 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False)

code_files = []
for f in result.get('files', {}).get('code', []):
    p = Path(f)
    code_files.extend(collect_files(p) if p.is_dir() else [p])

print(f"Detected {len(code_files)} code files out of {result.get('total_files')} total files.")

# 2. AST extraction
ast_result = {'nodes': [], 'edges': [], 'input_tokens': 0, 'output_tokens': 0}
if code_files:
    ast_result = ast_extract(code_files, cache_root=root)
    print(f"AST Extraction: {len(ast_result['nodes'])} nodes, {len(ast_result['edges'])} edges")
    
with open('graphify-out/.graphify_ast.json', 'w', encoding='utf-8') as f:
    json.dump(ast_result, f, ensure_ascii=False)

# 3. Semantic extraction
all_files = [f for files in result['files'].values() for f in files]
cached_nodes, cached_edges, cached_hyperedges, uncached = check_semantic_cache(all_files, root=root)

key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
sem_result = {'nodes': [], 'edges': [], 'hyperedges': [], 'input_tokens': 0, 'output_tokens': 0}

if uncached:
    if key:
        print(f"Running semantic extraction on {len(uncached)} files using Gemini...")
        sem_result = extract_corpus_parallel(uncached, backend='gemini')
        save_semantic_cache(sem_result.get('nodes', []), sem_result.get('edges', []), sem_result.get('hyperedges', []), root=root)
    else:
        print("Tip: set GEMINI_API_KEY or GOOGLE_API_KEY to use Gemini for semantic extraction. Skipping semantic analysis for now.")

# Merge cached and new semantic
sem_nodes = cached_nodes + sem_result.get('nodes', [])
sem_edges = cached_edges + sem_result.get('edges', [])
sem_hyperedges = cached_hyperedges + sem_result.get('hyperedges', [])

# Dedup
seen = set()
deduped_sem = []
for n in sem_nodes:
    if n['id'] not in seen:
        seen.add(n['id'])
        deduped_sem.append(n)

# 4. Merge AST and Semantic
seen_ast = {n['id'] for n in ast_result['nodes']}
merged_nodes = list(ast_result['nodes'])
for n in deduped_sem:
    if n['id'] not in seen_ast:
        merged_nodes.append(n)
        seen_ast.add(n['id'])

merged_edges = ast_result['edges'] + sem_edges
merged_hyperedges = sem_hyperedges
merged = {
    'nodes': merged_nodes,
    'edges': merged_edges,
    'hyperedges': merged_hyperedges,
    'input_tokens': sem_result.get('input_tokens', 0),
    'output_tokens': sem_result.get('output_tokens', 0),
}
with open('graphify-out/.graphify_extract.json', 'w', encoding='utf-8') as f:
    json.dump(merged, f, ensure_ascii=False)

print(f"Total Merged: {len(merged_nodes)} nodes, {len(merged_edges)} edges")

# 5. Build, Cluster, Report
G = build_from_json(merged)
if G.number_of_nodes() == 0:
    print("Graph empty!")
    sys.exit(0)

communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {'input': merged.get('input_tokens', 0), 'output': merged.get('output_tokens', 0)}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

labels = {cid: f'Community {cid}' for cid in communities}
questions = suggest_questions(G, communities, labels)

report = generate(G, communities, cohesion, labels, gods, surprises, result, tokens, str(root.resolve()), suggested_questions=questions)
with open('graphify-out/GRAPH_REPORT.md', 'w', encoding='utf-8') as f:
    f.write(report)
to_json(G, communities, 'graphify-out/graph.json')

print("DONE! Check graphify-out/GRAPH_REPORT.md")
