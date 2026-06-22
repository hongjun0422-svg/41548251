#!/bin/bash
# 더블클릭으로 웹앱 실행 (로컬 서버 + 브라우저 열기)
# 카메라 사용을 위해 file:// 이 아닌 http:// 로 접속합니다.

cd "$(dirname "$0")"
PORT=8080

# 포트가 사용 중이면 8081, 8082 … 로 시도
for p in 8080 8081 8082 8083 8888; do
  if ! lsof -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
    PORT=$p
    break
  fi
done

URL="http://localhost:${PORT}"

echo "======================================"
echo "  가족 비타민 캘린더 · 스마트 복용"
echo "======================================"
echo ""
echo "  서버 주소: ${URL}"
echo "  종료: 이 창에서 Ctrl+C"
echo ""

# macOS 기본 브라우저로 열기
(sleep 1 && open "${URL}") &

# Python 내장 웹 서버
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  python -m SimpleHTTPServer "$PORT"
else
  echo "Python이 설치되어 있지 않습니다."
  echo "index.html을 Live Server 등으로 여세요."
  read -r -p "Enter 키를 누르면 종료합니다…"
fi
