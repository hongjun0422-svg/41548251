#!/usr/bin/env python3
"""
라즈베리파이 알약 배출 서버
GPIO로 스텝 모터 또는 DC 모터를 제어합니다.

설치:
  pip install flask flask-cors RPi.GPIO

실행:
  python server.py

Pi 단독 (권장): 웹앱 「라즈베리파이 주소」에 http://127.0.0.1:5000
  다른 기기에서 접속: http://<Pi의 Wi‑Fi IP>:5000
  GET / = 상태 확인 · POST / = 복용 AI 확인 후 회로(모터) 작동
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import time

app = Flask(__name__)
CORS(app)

# ── GPIO 설정 (보드에 맞게 수정) ──
USE_GPIO = True
MOTOR_PIN = 17          # 릴레이 또는 모터 드라이버 IN
DISPENSE_DURATION = 2.0 # 모터 작동 시간(초)

try:
    import RPi.GPIO as GPIO
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(MOTOR_PIN, GPIO.OUT)
    GPIO.output(MOTOR_PIN, GPIO.LOW)
except (ImportError, RuntimeError):
    USE_GPIO = False
    print("⚠️  RPi.GPIO 사용 불가 — 시뮬레이션 모드로 실행합니다.")


def run_motor():
    if USE_GPIO:
        GPIO.output(MOTOR_PIN, GPIO.HIGH)
        time.sleep(DISPENSE_DURATION)
        GPIO.output(MOTOR_PIN, GPIO.LOW)
    else:
        print(f"[SIM] 모터 {DISPENSE_DURATION}초 작동")
        time.sleep(DISPENSE_DURATION)


@app.route("/", methods=["GET", "POST"])
def root():
    if request.method == "GET":
        return jsonify({"ok": True, "gpio": USE_GPIO})
    try:
        run_motor()
        return jsonify({"ok": True, "message": "알약 배출 완료"})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


@app.route("/dispense", methods=["POST", "GET"])
def dispense():
    try:
        run_motor()
        return jsonify({"ok": True, "message": "알약 배출 완료"})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "gpio": USE_GPIO})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
