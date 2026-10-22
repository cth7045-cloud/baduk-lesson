@echo off
chcp 65001 >nul
title 바둑 수업 - 서버 연결 설정
echo.
echo  ================================================================
echo   서버(Supabase) 연결 설정
echo   안내 문서나 대화창에서 받은 두 값을 차례로 붙여넣으세요.
echo   붙여넣기: 마우스 오른쪽 버튼 클릭
echo  ================================================================
echo.
set "SB_URL="
set "SB_KEY="
set /p "SB_URL= 1) 서버 주소 (https://로 시작) 붙여넣고 Enter: "
set /p "SB_KEY= 2) 공개 키 (sb_publishable_로 시작) 붙여넣고 Enter: "

if "%SB_URL%"=="" goto EMPTY
if "%SB_KEY%"=="" goto EMPTY

rem 한 번 저장해 두면 새 버전 폴더에서도 자동으로 다시 씀
set "SAVED=%USERPROFILE%\baduk-lesson.env"
> "%SAVED%" echo VITE_SUPABASE_URL=%SB_URL%
>> "%SAVED%" echo VITE_SUPABASE_ANON_KEY=%SB_KEY%
copy /y "%SAVED%" "%~dp0..\.env" >nul

echo.
echo  저장했습니다. 이제 "바둑 수업 시작"을 실행하세요.
echo.
pause
exit /b 0

:EMPTY
echo.
echo  [안내] 값이 비어 있습니다. 이 파일을 다시 실행해 주세요.
echo.
pause
exit /b 1
