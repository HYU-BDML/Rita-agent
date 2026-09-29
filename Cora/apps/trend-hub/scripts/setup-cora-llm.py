"""Install only Cora routes; never read/write credentials or other app routes."""
import json
from pathlib import Path
source = Path(__file__).resolve().parent.parent / 'config/llmgw-cora.example.json'
target = Path.home() / '.config/llmgw/models.json'
settings = json.loads(target.read_text()) if target.exists() else {}
settings.setdefault('routes', {}).update(json.loads(source.read_text())['routes'])
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(settings, indent=2) + '\n')
print('Installed cora_test and cora_quality routes. Credentials unchanged.')
