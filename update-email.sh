#!/bin/bash
NEW_EMAIL="kthk.kmbr@gmail.com"

SURL=$(grep '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | cut -d= -f2-)
SKEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2-)
OLD_PROFILE_ID="a0000002-0000-0000-0000-000000000000"
PARTNER_ID="b0000001-0000-0000-0000-000000000000"

python3 - "${SURL}" "${SKEY}" "${OLD_PROFILE_ID}" "${NEW_EMAIL}" "${PARTNER_ID}" << 'PYEOF'
import sys, json, urllib.request, urllib.error

surl, skey, old_pid, new_email, partner_id = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
hdrs = {"apikey": skey, "Authorization": "Bearer " + skey, "Content-Type": "application/json"}

def call(method, url, data=None, extra=None):
    h = dict(hdrs)
    if extra:
        h.update(extra)
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())

new_uid = None
cr = call("POST", surl + "/auth/v1/admin/users", {"email": new_email, "email_confirm": True})
if "id" in cr:
    new_uid = cr["id"]
    print("auth user created:", new_uid)
elif "already" in str(cr).lower() or "exists" in str(cr).lower():
    lr = call("GET", surl + "/auth/v1/admin/users?page=1&per_page=200")
    for u in (lr.get("users") or []):
        if u.get("email") == new_email:
            new_uid = u["id"]
            print("auth user exists:", new_uid)
            break
    if not new_uid:
        print("ERROR: could not find existing user -", cr)
        sys.exit(1)
else:
    print("ERROR creating auth user:", cr)
    sys.exit(1)

op = call("GET", surl + "/rest/v1/profiles?id=eq." + old_pid + "&select=name,role,color")
old = op[0] if op else {"name": "勝彦", "role": "partner", "color": "#C2479E"}

ex = call("GET", surl + "/rest/v1/profiles?id=eq." + new_uid + "&select=id")
if not ex:
    pr = call("POST", surl + "/rest/v1/profiles",
              {"id": new_uid, "name": old["name"], "role": old["role"], "email": new_email, "color": old.get("color", "#C2479E")},
              {"Prefer": "return=representation"})
    if isinstance(pr, list) and pr:
        print("profile created:", pr[0]["id"])
    else:
        print("ERROR creating profile:", pr)
        sys.exit(1)
else:
    call("PATCH", surl + "/rest/v1/profiles?id=eq." + new_uid,
         {"email": new_email, "name": old["name"], "role": "partner"})
    print("profile updated:", new_uid)

ar = call("PATCH", surl + "/rest/v1/partners?id=eq." + partner_id,
          {"profile_id": new_uid}, {"Prefer": "return=representation"})
if isinstance(ar, list) and ar:
    print("partners linked: profile_id =", ar[0]["profile_id"])
else:
    print("ERROR updating partners:", ar)
    sys.exit(1)

print("auth user ready")
print("profiles linked")
PYEOF
