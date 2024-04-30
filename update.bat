@echo off

echo Updating source...
git checkout main && git pull origin main

echo Building new build files...
npm install && npm run build

pause
