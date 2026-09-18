$py = "C:\Users\samje\.platformio\penv\Scripts\python.exe"
$esp = "C:\Users\samje\.platformio\packages\tool-esptoolpy\esptool.py"
$bootloader = "F:\ReefV1\firmware\.pio\build\esp32dev\bootloader.bin"
$partitions = "F:\ReefV1\firmware\.pio\build\esp32dev\partitions.bin"
$bootApp = "C:\Users\samje\.platformio\packages\framework-arduinoespressif32\tools\partitions\boot_app0.bin"
$firmware = "F:\ReefV1\firmware\.pio\build\esp32dev\firmware.bin"

Write-Host ">>> Starting ESP32 Flash Tool on COM3 <<<"
for ($attempt = 1; $attempt -le 8; $attempt++) {
    Write-Host "`n======================================================="
    Write-Host ">>> ATTEMPT $attempt of 8: Connecting to ESP32 on COM3 <<<"
    Write-Host ">>> (Hold down the BOOT button on the ESP32 now!) <<<"
    Write-Host "======================================================="
    
    & $py $esp --before default_reset --after hard_reset --chip esp32 --port COM3 --baud 460800 write_flash -z --flash_mode dio --flash_freq 40m --flash_size 4MB 0x1000 $bootloader 0x8000 $partitions 0xe000 $bootApp 0x10000 $firmware
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n>>> FIRMWARE FLASHED AND VERIFIED 100% SUCCESSFULLY! <<<"
        exit 0
    }
    Start-Sleep -Seconds 1
}

Write-Host "`n>>> Flash failed after 8 attempts. <<<"
exit 1
