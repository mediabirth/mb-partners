#!/bin/bash
ADMIN_EMAIL="mediabirth.project@gmail.com"
ADMIN_PASSWORD="joint0315"
ADMIN_NAME="MB Admin"

SURL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
SKEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.local | cut -d= -f2-)

python3 - "${SURL}" "${SKEY}" "${ANON}" "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}" "${ADMIN_NAME}" << 'PYEOF'
import sys, json, urllib.request, urllib.error

surl, skey, anon, email, password, name = sys.argv[1:]
admin_hdrs = {"apikey": skey, "Authorization": "Bearer " + skey, "Content-Type": "application/json"}

def admin(method, path, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(surl + path, data=body, headers=admin_hdrs, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return True, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        return False, (json.loads(raw) if raw.strip() else {"_status": e.code})

uid = None

ok, cr = admin("POST", "/auth/v1/admin/users", {"email": email, "password": password, "email_confirm": True})
if ok and "id" in cr:
    uid = cr["id"]
    print(f"[1] auth user created: {uid}")
else:
    if cr.get("error_code") == "email_exists" or "already" in str(cr).lower():
        # generate_link returns user data at top level (no nested "user" key)
        ok2, gl = admin("POST", "/auth/v1/admin/generate_link", {"type": "magiclink", "email": email})
        if ok2 and gl.get("id"):
            uid = gl["id"]
            print(f"[1] existing user found via generate_link: {uid}")
        else:
            print(f"[1] ERROR: cannot resolve existing user — generate_link returned: {gl}")
            sys.exit(1)
    else:
        print(f"[1] ERROR creating user: {cr}")
        sys.exit(1)

ok, up = admin("PUT", f"/auth/v1/admin/users/{uid}", {"password": password})
if ok or up == {}:
    print("[2] password set OK")
else:
    print(f"[2] password set result: {up}")

ok, existing = admin("GET", f"/rest/v1/profiles?id=eq.{uid}&select=id,role")
if ok and existing:
    _, patch = admin("PATCH", f"/rest/v1/profiles?id=eq.{uid}", {"role": "owner", "email": email, "name": name})
    print("[3] profile updated to owner")
else:
    _, ins = admin("POST", "/rest/v1/profiles", {"id": uid, "name": name, "role": "owner", "email": email, "color": "#4733E6"})
    print(f"[3] profile created (empty=success): {ins or '{}'}")

ok, verify = admin("GET", f"/rest/v1/profiles?id=eq.{uid}&select=id,name,email,role")
if ok and verify and verify[0].get("role") == "owner":
    print(f"[4] admin ready: owner role linked — {email}")
else:
    print(f"[4] WARNING: profile check: {verify}")

anon_hdrs = {"apikey": anon, "Content-Type": "application/json"}
body = json.dumps({"email": email, "password": password}).encode()
req = urllib.request.Request(surl + "/auth/v1/token?grant_type=password", data=body, headers=anon_hdrs, method="POST")
try:
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
        if data.get("access_token"):
            print("[5] signInWithPassword: OK — login at /console/login")
        else:
            print(f"[5] unexpected response: {data}")
except urllib.error.HTTPError as e:
    err = json.loads(e.read())
    print(f"[5] signInWithPassword FAILED: {err.get('error_description') or err.get('message')}")
PYEOF
