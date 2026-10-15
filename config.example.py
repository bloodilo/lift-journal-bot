# Журнал лифта: настройки. Скопировать в /srv/lift/config.py и заполнить. Файл с секретами в git не класть.
TG_API_ID = 0                      # my.telegram.org
TG_API_HASH = "..."
TG_PHONE = "+7..."                 # аккаунт, который состоит в чате подъезда
ANTHROPIC_API_KEY = "sk-ant-..."

CHAT_TITLE = "1 Подъезд"           # название чата в Telegram (подстрока)
MODEL = "claude-haiku-4-5"         # дешёвая модель, ~0.001 $ за сообщение

# Apps Script web app таблицы (см. gsheet-script.js); пусто = копить в базе, выгрузить позже
GSHEET_URL = ""
GSHEET_TOKEN = "CHANGE_ME"         # тот же, что TOKEN в gsheet-script.js
