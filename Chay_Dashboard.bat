@echo off
title Duolingo Friend Tracker Dashboard
mode con: cols=85 lines=25
color 0B

echo =====================================================================
echo    DUOLINGO FRIEND TRACKER - STANDALONE LOCAL WEB DASHBOARD
echo =====================================================================
echo.
echo  [+] He thong dang chuan bi khoi dong...
echo  [+] Dang tu dong mo trinh duyet tai: http://localhost:3000
echo.
echo ---------------------------------------------------------------------
echo  * LUU Y: Khong duoc tat cua so nay khi dang dung Dashboard!
echo  * De dung server: Nhay vao day nhan [Ctrl + C] hoac dong cua so nay.
echo ---------------------------------------------------------------------
echo.

rem Tu dong mo trinh duyet
start http://localhost:3000

rem Khoi chay Node.js server
node api/proxy.js

echo.
echo Server da dung hoat dong. Nhan phim bat ky de thoat...
pause > nul
