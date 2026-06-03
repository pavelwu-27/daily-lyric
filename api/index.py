from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS

from lyric_lib import get_one_lyric

app = Flask(__name__)
CORS(app)


@app.route("/api/lyric")
def lyric():
    offset = int(request.args.get("offset", "0"))
    now = datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    weekday = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][now.weekday()]
    date_display = f"{now.month}月{now.day}日 {weekday}"

    data = get_one_lyric(date_str, now.month, offset)
    if not data:
        return jsonify({"error": "暂时无法获取歌词"}), 500

    return jsonify({
        "date": date_display,
        "song": data["song"],
        "artist": data["artist"],
        "lyric": data["lyric"],
        "theme": data["theme"],
        "theme_bg": data["theme_bg"],
    })


if __name__ == "__main__":
    app.run(debug=True, port=5002)
