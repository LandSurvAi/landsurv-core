@echo off
REM Manual DLL Installation Workaround for LandsurvConnector
REM This script copies the DLL file to the correct installation location

setlocal enabledelayedexpansion

REM Installation folder
set INSTALL_FOLDER=C:\Program Files\LandSurv.ai
set DLL_NAME=LandsurvConnector.dll

REM Create installation folder if it doesn't exist
if not exist "!INSTALL_FOLDER!" (
    echo Creating installation folder: !INSTALL_FOLDER!
    mkdir "!INSTALL_FOLDER!"
)

REM Check if DLL is in the current directory
if exist "%DLL_NAME%" (
    echo Found %DLL_NAME% in current directory.
    echo Copying to !INSTALL_FOLDER!\...
    copy /Y "%DLL_NAME%" "!INSTALL_FOLDER!\%DLL_NAME%"
    
    if exist "!INSTALL_FOLDER!\%DLL_NAME%" (
        echo Success! %DLL_NAME% has been installed to !INSTALL_FOLDER!
        pause
        exit /b 0
    ) else (
        echo Error: Failed to copy %DLL_NAME%
        pause
        exit /b 1
    )
) else (
    echo Error: %DLL_NAME% not found in current directory.
    echo Please run this script from the directory containing %DLL_NAME%
    pause
    exit /b 1
)
