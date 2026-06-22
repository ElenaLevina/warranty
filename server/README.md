# Warranty receiver (ПК в локальной сети)

Маленький кроссплатформенный сервис: принимает файлы кейсов с телефона механика
и складывает их в указанную папку для дальнейшей передачи в главный офис.
Один статический бинарник, рантайм ставить не нужно.

## Сборка

Нужен [Go 1.22+](https://go.dev/dl/). В папке `server/`:

```bash
go build -o warranty-receiver .
```

Кросс-компиляция под другую ОС (пример — собрать Windows .exe на Mac/Linux):
```bash
GOOS=windows GOARCH=amd64 go build -o warranty-receiver.exe .   # Windows
GOOS=darwin  GOARCH=arm64 go build -o warranty-receiver-mac .    # macOS (Apple Silicon)
GOOS=linux   GOARCH=amd64 go build -o warranty-receiver-linux .  # Linux
```

## Запуск

```bash
./warranty-receiver -dir "/data/warranty-cases" -token "ПРИДУМАЙТЕ_ТОКЕН" -addr ":8080"
```
- `-dir`   — папка, куда складывать кейсы (обязательно).
- `-token` — общий секрет; тот же токен вводится в приложении (обязательно).
- `-addr`  — адрес/порт прослушивания (по умолчанию `:8080`).

Узнайте IP компьютера в сети (`ipconfig` / `ifconfig`) — он вводится в приложении
как `http://<IP>:8080`. Откройте порт в брандмауэре.

Структура на ПК: `dir/<case_id>/{plate.jpg, photo_001.jpg, video_001.mp4, session.json}`.

## Автозапуск

- **Windows:** проще всего через [NSSM](https://nssm.cc): `nssm install WarrantyReceiver`,
  путь к `warranty-receiver.exe`, аргументы `-dir D:\cases -token СЕКРЕТ`. Либо `sc create`.
- **Linux (systemd):** см. `scripts/warranty-receiver.service`.
- **macOS (launchd):** см. `scripts/com.warranty.receiver.plist`.

## TLS (опционально)

```bash
scripts/gen-cert.sh 10.0.0.9     # cert.pem (CA, IP в SAN) + key.pem
./warranty-receiver -dir "/data/warranty-cases" -token "СЕКРЕТ" -addr :8443 \
  -cert cert.pem -key key.pem
```
`cert.pem` установить на телефоны как сертификат ЦС; в приложении адрес
`https://10.0.0.9:8443`. Подробно — `../docs/upload.md`.

## Безопасность (v1)

- Bearer-токен; по умолчанию HTTP в доверенной LAN, опционально TLS (выше).
- Файлы приходят уже расшифрованными (расшифровка на телефоне) — на ПК лежат
  читаемые JPG/MP4/JSON, готовые к пересылке в офис.
- Целостность по размеру файла (`size`); повторная отправка идемпотентна.

Полный REST-контракт — в `../docs/upload.md`.
