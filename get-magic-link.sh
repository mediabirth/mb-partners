#!/bin/bash
EMAIL="kthk.kmbr@gmail.com"
REDIRECT="https://mb-partners.vercel.app/auth/magic"

SURL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
SKEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)

python3 - "${SURL}" "${SKEY}" "${EMAIL}" "${REDIRECT}" << 'PYEOF'
import sys, json, urllib.request, urllib.error

surl, skey, email, redirect = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
hdrs = {"apikey": skey, "Authorization": "Bearer " + skey, "Content-Type": "application/json"}

body = json.dumps({"type": "magiclink", "email": email, "redirect_to": redirect}).encode()
req = urllib.request.Request(surl + "/auth/v1/admin/generate_link", data=body, headers=hdrs, method="POST")
try:
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
except urllib.error.HTTPError as e:
    data = json.loads(e.read())

link = data.get("action_link") or data.get("properties", {}).get("action_link")
if link:
    print("\nログインリンク（ブラウザに貼り付けてください）:\n")
    print(link)
    print()
else:
    print("ERROR:", json.dumps(data, ensure_ascii=False))
PYEOF
