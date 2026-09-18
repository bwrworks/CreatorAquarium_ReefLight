import requests
import json

BASE_URL = "http://localhost:3000"

def test():
    session = requests.Session()
    
    # 1. Login
    login_resp = session.post(f"{BASE_URL}/api/auth/login", json={"passcode": "9206336482"})
    print("Login Status:", login_resp.status_code, login_resp.text)
    assert login_resp.status_code == 200, "Login failed!"
    
    # 2. GET Presets
    presets_resp = session.get(f"{BASE_URL}/api/presets")
    print("GET /api/presets Status:", presets_resp.status_code)
    presets = presets_resp.json()
    print("Fetched Presets Count:", len(presets))
    print("Presets:", json.dumps(presets, indent=2))
    assert presets_resp.status_code == 200, "GET presets failed!"
    
    # 3. Test saving a new preset
    new_preset = {
        "id": "test_preset_coral_safe",
        "name": "Coral Safe 50%",
        "channels": {"blue": 50, "white": 20, "uv": 40},
        "fan": 45
    }
    updated_list = presets + [new_preset]
    post_resp = session.post(f"{BASE_URL}/api/presets", json=updated_list)
    print("POST /api/presets Status:", post_resp.status_code, post_resp.text)
    assert post_resp.status_code == 200, "POST presets failed!"
    
    # 4. Verify saved preset is retrieved
    verify_resp = session.get(f"{BASE_URL}/api/presets")
    verify_presets = verify_resp.json()
    print("Retrieved after save count:", len(verify_presets))
    names = [p["name"] for p in verify_presets]
    assert "Coral Safe 50%" in names, "New preset was not retrieved!"
    print("SUCCESS: Central cross-device presets API is fully working!")

if __name__ == "__main__":
    test()
