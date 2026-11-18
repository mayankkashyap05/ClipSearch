@echo off
setlocal EnableExtensions
cd /d "%~dp0"

:: Prevent global / Conda variables from leaking into the new venv
set "PYTHONHOME="
set "PYTHONPATH="
set "PIP_DISABLE_PIP_VERSION_CHECK=1"

echo ====================================================================
echo   ClipSearch - Complete Windows Installer (Python 3.13.5)
echo ====================================================================
echo.

:: Require 64-bit Windows (PyTorch has no 32-bit Windows wheels)
if /I not "%PROCESSOR_ARCHITECTURE%"=="AMD64" if /I not "%PROCESSOR_ARCHITEW6432%"=="AMD64" (
    echo [ERROR] ClipSearch requires 64-bit Windows ^(AMD64^).
    goto :fail
)

if not exist "requirements.txt" (
    echo [ERROR] requirements.txt not found in "%~dp0".
    echo         Make sure install.bat is inside the ClipSearch project folder.
    goto :fail
)

call :ensure_vc_redist    || goto :fail
call :ensure_python      || goto :fail
call :ensure_ffmpeg      || goto :fail
call :ensure_deno        || goto :fail
call :ensure_venv        || goto :fail
call :install_deps       || goto :fail
call :ensure_env_file    || goto :fail
call :ensure_ollama
call :verify_install     || goto :fail

echo.
echo ====================================================================
echo   ClipSearch Setup Complete!
echo ====================================================================
echo.
echo   Start the server ^(single process; do NOT use --reload^):
echo     venv\Scripts\uvicorn.exe app.api.main:app --host 127.0.0.1 --port 8000
echo.
echo   Then open in your browser:
echo     http://127.0.0.1:8000
echo ====================================================================
echo.
pause
exit /b 0


:: ====================================================================
:: 1. Visual C++ Redistributable (required by PyTorch on fresh Windows)
:: ====================================================================
:ensure_vc_redist
echo [1/9] Checking Microsoft Visual C++ Runtime...
if exist "%SystemRoot%\System32\vcruntime140_1.dll" (
    echo       [OK] Visual C++ Redistributable is installed.
    echo.
    exit /b 0
)
echo       Visual C++ Runtime missing. Installing ^(needed by PyTorch^)...
where winget >nul 2>&1
if not errorlevel 1 (
    winget install -e --id Microsoft.VCRedist.2015+.x64 --accept-package-agreements --accept-source-agreements --silent
)
if exist "%SystemRoot%\System32\vcruntime140_1.dll" (
    echo       [OK] Visual C++ Redistributable installed.
    echo.
    exit /b 0
)
echo       Downloading official VC++ Redistributable installer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile '%TEMP%\vc_redist.x64.exe'"
if exist "%TEMP%\vc_redist.x64.exe" (
    start /wait "" "%TEMP%\vc_redist.x64.exe" /install /quiet /norestart
    del /f /q "%TEMP%\vc_redist.x64.exe" >nul 2>&1
)
if exist "%SystemRoot%\System32\vcruntime140_1.dll" (
    echo       [OK] Visual C++ Redistributable installed.
) else (
    echo       [WARN] Could not confirm VC++ Redistributable. If PyTorch fails to import,
    echo              install it manually from: https://aka.ms/vs/17/release/vc_redist.x64.exe
)
echo.
exit /b 0


:: ====================================================================
:: 2. Python 3.13.5
:: ====================================================================
:ensure_python
echo [2/9] Checking Python 3.13...
call :find_python313
if defined PYTHON_EXE goto :python_ready

echo       Python 3.13 not found. Installing Python 3.13.5...
where winget >nul 2>&1
if not errorlevel 1 (
    winget install -e --id Python.Python.3.13 --version 3.13.5 --scope user --accept-package-agreements --accept-source-agreements
    call :refresh_path
    call :find_python313
)
if defined PYTHON_EXE goto :python_ready

echo       Downloading official Python 3.13.5 installer ^(python.org^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://www.python.org/ftp/python/3.13.5/python-3.13.5-amd64.exe' -OutFile '%TEMP%\python-3.13.5-amd64.exe'" || (
    echo [ERROR] Failed to download Python 3.13.5. Check your internet connection.
    exit /b 1
)
echo       Running silent per-user Python 3.13.5 install...
start /wait "" "%TEMP%\python-3.13.5-amd64.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_pip=1 Include_test=0 Shortcuts=0
del /f /q "%TEMP%\python-3.13.5-amd64.exe" >nul 2>&1
call :refresh_path
call :find_python313
if not defined PYTHON_EXE (
    echo [ERROR] Python 3.13.5 could not be found after installation.
    echo         Close this window, open a new terminal, and run install.bat again.
    exit /b 1
)

:python_ready
echo       [OK] Using: "%PYTHON_EXE%"
"%PYTHON_EXE%" --version
echo.
exit /b 0


:find_python313
set "PYTHON_EXE="
for /f "usebackq delims=" %%I in (`py -3.13 -c "import sys; print(sys.executable)" 2^>nul`) do (
    if exist "%%I" set "PYTHON_EXE=%%I"
)
if defined PYTHON_EXE exit /b 0

if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
    exit /b 0
)
if exist "C:\Python313\python.exe" (
    set "PYTHON_EXE=C:\Python313\python.exe"
    exit /b 0
)
if exist "%ProgramFiles%\Python313\python.exe" (
    set "PYTHON_EXE=%ProgramFiles%\Python313\python.exe"
    exit /b 0
)
for /f "usebackq delims=" %%I in (`python -c "import sys; print(sys.executable) if sys.version_info[:2]==(3,13) else sys.exit(1)" 2^>nul`) do (
    if exist "%%I" set "PYTHON_EXE=%%I"
)
if defined PYTHON_EXE exit /b 0
exit /b 1


:: ====================================================================
:: 3. FFmpeg (audio extraction, keyframes, Whisper, yt-dlp MP4 merge)
:: ====================================================================
:ensure_ffmpeg
echo [3/9] Checking FFmpeg...
call :find_ffmpeg
if not errorlevel 1 goto :ffmpeg_ready

echo       FFmpeg not found. Installing via winget...
where winget >nul 2>&1
if not errorlevel 1 (
    winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
    call :refresh_path
    call :find_ffmpeg
    if not errorlevel 1 goto :ffmpeg_ready
)

echo       Falling back to direct FFmpeg download ^(gyan.dev^)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop';" ^
    "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;" ^
    "$zip=Join-Path $env:TEMP 'ffmpeg-essentials.zip';" ^
    "$ext=Join-Path $env:TEMP 'ffmpeg-extract';" ^
    "$dest=Join-Path $env:LOCALAPPDATA 'ClipSearch\ffmpeg\bin';" ^
    "Invoke-WebRequest -UseBasicParsing -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile $zip;" ^
    "if (Test-Path $ext) { Remove-Item -Recurse -Force $ext };" ^
    "Expand-Archive -Path $zip -DestinationPath $ext -Force;" ^
    "$bin=(Get-ChildItem -Path $ext -Recurse -Filter 'ffmpeg.exe' | Select-Object -First 1).DirectoryName;" ^
    "New-Item -ItemType Directory -Force -Path $dest | Out-Null;" ^
    "Copy-Item (Join-Path $bin '*.exe') -Destination $dest -Force;" ^
    "Remove-Item $zip -Force; Remove-Item $ext -Recurse -Force;" ^
    "$userPath=[Environment]::GetEnvironmentVariable('Path','User');" ^
    "if (-not ($userPath -split ';' | Where-Object { $_ -ieq $dest })) { [Environment]::SetEnvironmentVariable('Path', ($dest + ';' + $userPath).Trim(';'), 'User') }" || (
    echo [ERROR] Failed to install FFmpeg automatically.
    echo         Install FFmpeg manually and add its bin folder to PATH.
    exit /b 1
)
call :refresh_path
call :find_ffmpeg
if errorlevel 1 (
    echo [ERROR] FFmpeg still not found on PATH after installation.
    exit /b 1
)

:ffmpeg_ready
for /f "usebackq delims=" %%F in (`where ffmpeg 2^>nul`) do (
    echo       [OK] Found: %%F
    goto :ffmpeg_done
)
:ffmpeg_done
echo.
exit /b 0


:find_ffmpeg
where ffmpeg >nul 2>&1 && exit /b 0
if exist "C:\ffmpeg\bin\ffmpeg.exe" (
    set "PATH=C:\ffmpeg\bin;%PATH%"
    exit /b 0
)
if exist "%LOCALAPPDATA%\ClipSearch\ffmpeg\bin\ffmpeg.exe" (
    set "PATH=%LOCALAPPDATA%\ClipSearch\ffmpeg\bin;%PATH%"
    exit /b 0
)
exit /b 1


:: ====================================================================
:: 4. Deno (required by yt-dlp for YouTube JS challenge solving)
:: ====================================================================
:ensure_deno
echo [4/9] Checking Deno ^(for yt-dlp YouTube support^)...
call :find_deno
if not errorlevel 1 goto :deno_ready

echo       Deno not found. Installing via winget...
where winget >nul 2>&1
if not errorlevel 1 (
    winget install -e --id DenoLand.Deno --accept-package-agreements --accept-source-agreements
    call :refresh_path
    call :find_deno
    if not errorlevel 1 goto :deno_ready
)

echo       Falling back to official Deno installer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; irm https://deno.land/install.ps1 | iex"
call :refresh_path
call :find_deno
if errorlevel 1 (
    echo       [WARN] Deno could not be installed automatically.
    echo              Local file uploads will work, but YouTube URL downloads require Deno.
    echo              Install manually: winget install -e --id DenoLand.Deno
    echo.
    exit /b 0
)

:deno_ready
for /f "usebackq delims=" %%D in (`where deno 2^>nul`) do (
    echo       [OK] Found: %%D
    goto :deno_done
)
:deno_done
echo.
exit /b 0


:find_deno
where deno >nul 2>&1 && exit /b 0
if exist "%USERPROFILE%\.deno\bin\deno.exe" (
    set "PATH=%USERPROFILE%\.deno\bin;%PATH%"
    exit /b 0
)
exit /b 1


:: ====================================================================
:: 5. Virtual Environment (venv) — rebuilds automatically if stale
:: ====================================================================
:ensure_venv
echo [5/9] Setting up Python virtual environment ^(venv^)...
set "VENV_PY=%~dp0venv\Scripts\python.exe"

if exist "%VENV_PY%" (
    "%VENV_PY%" -c "import sys; raise SystemExit(0 if sys.version_info[:2]==(3,13) else 1)" >nul 2>&1
    if not errorlevel 1 (
        echo       [OK] Existing Python 3.13 venv is healthy.
        echo.
        exit /b 0
    )
    echo       Existing venv is invalid or wrong Python version. Recreating...
    rmdir /s /q "%~dp0venv"
)

"%PYTHON_EXE%" -m venv "%~dp0venv" || (
    echo [ERROR] Failed to create virtual environment.
    exit /b 1
)
echo       [OK] Created venv with Python 3.13.
echo.
exit /b 0


:: ====================================================================
:: 6. Install Python Packages (GPU-aware PyTorch + requirements.txt)
:: ====================================================================
:install_deps
echo [6/9] Upgrading pip, setuptools, and wheel...
"%VENV_PY%" -m pip install --upgrade pip setuptools wheel || exit /b 1

set "HAS_NVIDIA=0"
nvidia-smi >nul 2>&1 && set "HAS_NVIDIA=1"

if "%HAS_NVIDIA%"=="1" (
    echo       NVIDIA GPU detected. Checking PyTorch CUDA support...
    "%VENV_PY%" -c "import torch; raise SystemExit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
    if errorlevel 1 (
        echo       Attempting CUDA-enabled PyTorch install ^(2.15.0^)...
        "%VENV_PY%" -m pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cu128 >nul 2>&1
        if errorlevel 1 "%VENV_PY%" -m pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cu126 >nul 2>&1
        if errorlevel 1 "%VENV_PY%" -m pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cu124 >nul 2>&1
        if errorlevel 1 (
            echo       No dedicated CUDA wheel matched torch==2.15.0; using standard PyPI build...
            "%VENV_PY%" -m pip install torch==2.15.0 || exit /b 1
        )
    ) else (
        echo       [OK] CUDA-enabled PyTorch is already installed.
    )
) else (
    echo       No NVIDIA GPU detected. Installing CPU PyTorch ^(2.15.0^)...
    "%VENV_PY%" -m pip install torch==2.15.0 || exit /b 1
)

echo       Installing remaining dependencies from requirements.txt...
echo       ^(First install downloads ~1-3 GB of ML libraries; please wait...^)
"%VENV_PY%" -m pip install -r requirements.txt || (
    echo [ERROR] pip install failed. Review the error messages above.
    exit /b 1
)
echo       [OK] All Python packages installed.
echo.
exit /b 0


:: ====================================================================
:: 7. Create .env with a unique random JWT_SECRET (preserves existing)
:: ====================================================================
:ensure_env_file
echo [7/9] Checking .env configuration...
if exist ".env" (
    echo       [OK] .env already exists; keeping your existing configuration.
    echo.
    exit /b 0
)
"%VENV_PY%" -c "import secrets; content = f'# --- Local Sessions ---\n# This can be any random string. It keeps you logged in locally.\nJWT_SECRET={secrets.token_urlsafe(48)}\n\n# --- Local AI (Ollama) ---\n# Change these anytime you want to use a different model or server.\nLLM_BASE_URL=http://localhost:11434/v1\nLLM_MODEL=gemma3:1b\n'; open('.env','w',encoding='utf-8').write(content)" || exit /b 1
echo       [OK] Created .env with a fresh random JWT_SECRET and gemma3:1b.
echo.
exit /b 0


:: ====================================================================
:: 8. Ollama + Default Local LLM (gemma3:1b)
:: ====================================================================
:ensure_ollama
echo [8/9] Checking Ollama ^(local LLM for summaries and video Q^&A^)...
call :find_ollama
if defined OLLAMA_BIN goto :ollama_pull

echo       Ollama not found. Installing via winget...
where winget >nul 2>&1
if not errorlevel 1 (
    winget install -e --id Ollama.Ollama --accept-package-agreements --accept-source-agreements
    call :refresh_path
    call :find_ollama
)
if defined OLLAMA_BIN goto :ollama_pull

echo       Falling back to direct OllamaSetup.exe download...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile '%TEMP%\OllamaSetup.exe'"
if exist "%TEMP%\OllamaSetup.exe" (
    start /wait "" "%TEMP%\OllamaSetup.exe" /VERYSILENT /NORESTART
    del /f /q "%TEMP%\OllamaSetup.exe" >nul 2>&1
    call :refresh_path
    call :find_ollama
)
if not defined OLLAMA_BIN (
    echo       [WARN] Ollama was not installed. ClipSearch will still run with fallback summaries.
    echo              Install later from https://ollama.com and run: ollama pull gemma3:1b
    echo.
    exit /b 0
)

:ollama_pull
echo       [OK] Found Ollama: "%OLLAMA_BIN%"
:: Ensure the Ollama daemon is listening before pulling the model
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:11434/api/tags' | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo       Starting Ollama service...
    start "" /B "%OLLAMA_BIN%" serve >nul 2>&1
    powershell -NoProfile -Command "for ($i=0; $i -lt 15; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 'http://127.0.0.1:11434/api/tags' | Out-Null; exit 0 } catch { Start-Sleep -Seconds 1 } }; exit 1" >nul 2>&1
)
echo       Pulling default model ^(gemma3:1b^)...
"%OLLAMA_BIN%" pull gemma3:1b
if errorlevel 1 (
    echo       [WARN] Could not pull gemma3:1b right now.
    echo              Start Ollama later and run: ollama pull gemma3:1b
) else (
    echo       [OK] Model gemma3:1b is ready.
)
echo.
exit /b 0


:find_ollama
set "OLLAMA_BIN="
for /f "usebackq delims=" %%O in (`where ollama 2^>nul`) do (
    set "OLLAMA_BIN=%%O"
    exit /b 0
)
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    set "OLLAMA_BIN=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
    exit /b 0
)
exit /b 1


:: ====================================================================
:: 9. Full Live Verification
:: ====================================================================
:verify_install
echo [9/9] Verifying installation ^(imports, auth hash, GPU, binaries^)...
"%VENV_PY%" -c "import shutil, fastapi, uvicorn, pydantic, multipart, dotenv, requests, sqlalchemy, jwt, passlib, bcrypt, yt_dlp, whisper, torch, transformers, safetensors, PIL, numpy, sentence_transformers, qdrant_client; from passlib.context import CryptContext; h=CryptContext(schemes=['bcrypt']).hash('clipsearch_ok'); assert CryptContext(schemes=['bcrypt']).verify('clipsearch_ok', h); print(f'      [OK] All Python packages + bcrypt auth verified.'); print(f'      [OK] PyTorch {torch.__version__} (CUDA available: {torch.cuda.is_available()})'); print(f'      [OK] FFmpeg: {shutil.which(\"ffmpeg\") or \"MISSING\"}'); print(f'      [OK] Deno:   {shutil.which(\"deno\") or \"MISSING\"}')" || exit /b 1
exit /b 0


:: ====================================================================
:: Helper: Refresh PATH from Windows Registry without restarting shell
:: ====================================================================
:refresh_path
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$m=[Environment]::GetEnvironmentVariable('Path','Machine'); $u=[Environment]::GetEnvironmentVariable('Path','User'); ($m,$u | Where-Object {$_}) -join ';'"`) do set "PATH=%%P"
if exist "%USERPROFILE%\.deno\bin" set "PATH=%USERPROFILE%\.deno\bin;%PATH%"
if exist "%LOCALAPPDATA%\ClipSearch\ffmpeg\bin" set "PATH=%LOCALAPPDATA%\ClipSearch\ffmpeg\bin;%PATH%"
if exist "%LOCALAPPDATA%\Programs\Ollama" set "PATH=%LOCALAPPDATA%\Programs\Ollama;%PATH%"
exit /b 0


:fail
echo.
echo ====================================================================
echo   [FAILED] Setup stopped due to an error above.
echo ====================================================================
echo.
pause
exit /b 1