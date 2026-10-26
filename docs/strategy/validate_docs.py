"""Validate the PULSE documentation package, historical evidence and generated model.
No app, network, database or deployment operations. Run with Python 3.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
DOCS=ROOT/"docs"
STRATEGY=DOCS/"strategy"
REQUIRED="EXECUTIVE_AUDIT MARKET_COMPETITORS PULSE_VISION_V2 PRODUCT_IMPROVEMENTS UX_GAME_DESIGN GROWTH_STRATEGY BUSINESS_MODEL TECHNICAL_REVIEW TRUST_SAFETY_REVIEW RISK_REGISTER 90_DAY_ACTION_PLAN FOUNDER_DECISION_MEMO".split()
CORE=["README.md","ROADMAP.md","TODO.md","PUSH_TO_GITHUB.md"]+[
    "docs/"+name+".md" for name in
    "PRD GAME_DESIGN PULSE_GAME_SOCIAL_EXPANSION CONTENT_PLAYBOOK BUSINESS_PLAN ARCHITECTURE METRICS SAFETY_PRIVACY RESEARCH LITMATCH_FEATURE_MATRIX CODEX_FIRST_SPRINT DECISIONS".split()]

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    for name in CORE:
        p=ROOT/name
        assert p.exists(),name
        assert "v0.4" in p.read_text(encoding="utf-8")[:600],name
    for name in REQUIRED:
        p=STRATEGY/(name+".md")
        assert p.exists(),name
        assert "v0.4" in p.read_text(encoding="utf-8")[:300],name
    links=0
    for p in list(ROOT.glob("*.md"))+list(DOCS.rglob("*.md")):
        for target in re.findall(r"\]\(([^)]+)\)",p.read_text(encoding="utf-8")):
            if "://" in target or target.startswith("#") or target.startswith("mailto:"):
                continue
            target=target.split("#")[0].split(' "')[0].strip("<>")
            assert (p.parent/target).exists(),(str(p.relative_to(ROOT)),target)
            links+=1
    improvements=(STRATEGY/"PRODUCT_IMPROVEMENTS.md").read_text()
    assert re.findall(r"^\| (\d+) / P\d",improvements,re.M)==[str(i) for i in range(1,11)]
    founders=(STRATEGY/"FOUNDER_DECISION_MEMO.md").read_text()
    assert re.findall(r"^## (\d+)\.",founders,re.M)==[str(i) for i in range(1,19)]
    risks=(STRATEGY/"RISK_REGISTER.md").read_text()
    assert re.findall(r"^\| RSK(\d+) ",risks,re.M)==[f"{i:02}" for i in range(1,29)]
    archived=DOCS/"archive/genesis-v1"
    manifest=json.loads((archived/"SNAPSHOT_SHA256.json").read_text())
    assert len(manifest)==19
    for name,sha in manifest.items():
        assert digest(archived/name)==sha,("historical evidence changed",name)
    outputs=[STRATEGY/"financial_model.json",STRATEGY/"MODEL_OUTPUT.md"]
    before=[digest(p) for p in outputs]
    subprocess.run([sys.executable,str(STRATEGY/"models.py")],check=True)
    assert before==[digest(p) for p in outputs],"model outputs were stale"
    model=json.loads(outputs[0].read_text())
    assert model["version"]=="0.4"
    assert len(model["scenarios"])==3
    assert all(len(rows)==4 for rows in model["scenarios"].values())
    assert len(model["sensitivity_100k"])==12
    print(f"PASS: {len(CORE)} canonical docs; 12 reports; 10 improvements; 18 founder answers; 28 risks; {links} local links; 19 preserved evidence files; deterministic model.")
    print("This validates documentation structure and arithmetic, not product quality or alpha safety.")

if __name__=="__main__":
    main()
