@echo off
chcp 65001 >nul
title 바둑 수업 - 개발 서버
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 goto NO_NODE

rem 서버 연결 정보(.env): 없으면 저장해 둔 것을 가져오고, 그것도 없으면 설정 창을 띄움
if not exist ".env" if exist "%USERPROFILE%\baduk-lesson.env" copy /y "%USERPROFILE%\baduk-lesson.env" ".env" >nul
if not exist ".env" call "%~dp0서버-연결-설정.bat"

echo.
echo  필요한 파일을 확인하고 있습니다. 처음 실행할 때는 1~3분 정도 걸립니다...
echo.
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  if not exist node_modules goto INSTALL_FAIL
  echo  인터넷 연결 문제로 업데이트 확인을 건너뜁니다.
)

echo.
echo  ================================================================
echo   바둑 수업 프로그램을 시작합니다. 잠시 후 브라우저가 열립니다.
echo.
echo   - 같은 와이파이의 폰/태블릿에서도 접속하려면 아래에 나오는
echo     Network 주소를 폰 브라우저에 입력하세요.
echo   - 이 검은 창을 닫으면 프로그램이 꺼집니다.
echo  ================================================================
echo.
call npm run dev -- --open
pause
exit /b 0

:NO_NODE
echo.
echo  [안내] Node.js 가 설치되어 있지 않습니다.
echo  잠시 후 열리는 Node.js 홈페이지에서 LTS 버전을 내려받아 설치한 뒤,
echo  이 파일을 다시 더블클릭해 주세요.
echo.
start "" "https://nodejs.org/ko/download"
pause
exit /b 1

:INSTALL_FAIL
echo.
echo  [오류] 필요한 파일 설치에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.
echo.
pause
exit /b 1
