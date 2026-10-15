"""Проверка разбора и логики простоев на выдуманном чате, во временной базе."""
import asyncio, sys, tempfile, types
from datetime import datetime, timedelta, timezone
sys.path.insert(0, "/opt/lift")
import lift

lift.DATA = tempfile.mkdtemp()
lift.init_db()

class S:  # отправитель
    def __init__(s, n): s.first_name, s.last_name, s.username, s.title = n, None, None, None

def M(i, when, who, text, media=False):
    return types.SimpleNamespace(id=i, date=when, message=text, sender=S(who), sender_id=hash(who) % 1000,
                                 post_author=None, media=media)

t = datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc)
H = lambda h: t + timedelta(hours=h)
CHAT = [
    M(1, H(0), "Оля", "Доброе утро! Кто потерял ключи у почтовых ящиков?"),
    M(2, H(1), "Игорь", "Опять грузовой лифт не работает, стоит на 5 этаже с открытыми дверями"),
    M(3, H(1.2), "Света", "Да что ж такое, третий раз за месяц"),
    M(4, H(2), "Оля", "Я звонила в диспетчерскую, сказали мастер будет после обеда"),
    M(5, H(3), "Петя", "Соседи, придержите лифт пожалуйста, я с коляской на первом"),
    M(6, H(30), "Игорь", "Ура, заработал"),
    M(7, H(50), "Света", "Продаю детский велосипед, недорого"),
    M(8, H(100), "Анна", "а маленький лифт опять сломался?"),
    M(9, H(101), "Петя", "Да, застрял в нём утром, вытаскивали 20 минут"),
    M(10, H(100 + 24 * 9), "Оля", "лифт не едет, кнопка вызова не горит"),
    M(11, H(100 + 24 * 9 + 5), "Игорь", "починили, оба ездят"),
    M(12, H(100 + 24 * 9 + 6), "Анна", "Завтра с 10 до 12 лифты отключат на плановое ТО, объявление висит"),
]

async def main():
    for m in CHAT:
        await lift.process(m, "https://t.me/c/1")
    with lift.conn() as c:
        for r in c.execute("SELECT id,kind,lift,incident,text FROM msgs ORDER BY id"):
            print(f"{r['id']:>2} {r['kind']:<7} {r['lift']:<13} inc={r['incident']} | {r['text'][:60]}")
    lift.report()

asyncio.run(main())
