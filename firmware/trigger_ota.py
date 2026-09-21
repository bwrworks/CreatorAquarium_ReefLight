import ssl
import time
import json
import paho.mqtt.client as mqtt

OTA_URL = "https://raw.githubusercontent.com/bwrworks/CreatorAquarium_ReefLight/main/firmware/releases/firmware.bin"
OTA_TOKEN = "rf_ota_9f83a27c4d1e8b6503f"
OTA_SHA256 = "50aa94c4637a21e544179ff9870d1eab92ee76cbed4f160446d172d993c97a97"

def on_connect(c, u, f, rc, p=None):
    print("[MQTT Connected] Subscribing to device feedback...", flush=True)
    c.subscribe("reef/reef-esp32-01/#", qos=1)
    
    payload = json.dumps({
        "url": OTA_URL,
        "token": OTA_TOKEN,
        "sha256": OTA_SHA256
    })
    print(f"[PUBLISHING OTA COMMAND] -> reef/reef-esp32-01/cmd/ota", flush=True)
    c.publish("reef/reef-esp32-01/cmd/ota", payload, qos=1)

def on_message(c, u, msg):
    print(f"[RECV] {msg.topic} -> {msg.payload.decode('utf-8', errors='ignore')}", flush=True)

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2 if hasattr(mqtt, 'CallbackAPIVersion') else None, client_id='ota-trigger-cli')
client.username_pw_set("Reef_light", "LQ#9OVUSZ1S")
client.tls_set(cert_reqs=ssl.CERT_NONE)
client.tls_insecure_set(True)
client.on_connect = on_connect
client.on_message = on_message

print("Connecting to HiveMQ Cloud...", flush=True)
client.connect("c7e756c95d22406988e67a7e6caabb02.s1.eu.hivemq.cloud", 8883, 60)

start = time.time()
while time.time() - start < 35:
    client.loop(0.1)

client.disconnect()
print("OTA monitoring session finished.", flush=True)
