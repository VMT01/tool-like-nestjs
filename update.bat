@echo off

echo Updating source...
git pull

echo Removing old build files...
rm -rf dist

echo Building new build files...
npm run build