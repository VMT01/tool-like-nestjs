@echo off

echo Updating source...
git reset --hard HEAD && git checkout main && git pull origin main

echo Building new build files...
npm install && npm run build

pause