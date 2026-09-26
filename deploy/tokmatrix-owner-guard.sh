#!/usr/bin/env bash
# Tra quyen so huu /opt/tokmatrix ve tokmatrix:tokmatrix, chay moi phut (tokmatrix-owner-guard.timer).
#
# Vi sao: tokmatrix-web chay bang user tokmatrix. Mot lan trien khai bang root (tar/scp tu Mac)
# tung doi chu /opt/tokmatrix va bkt_web thanh root; SQLite khong tao duoc file -journal/-wal
# canh bkt_channels.db nen moi thao tac ghi bao "attempt to write a readonly database"
# (/api/channels 500, bo lap lich dang bai loi) cho toi lan restart ke tiep.
#
# Chi chown nhung muc sai chu (khong chown -R ca cay), khong theo symlink (-h), khong xoa gi.
# Bi mat (pool tai khoan, token) nam o /etc/tokmatrix, khong trong /opt/tokmatrix.
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/tokmatrix}"
APP_USER="${APP_USER:-tokmatrix}"

[ -d "$APP_DIR" ] || exit 0
id "$APP_USER" >/dev/null 2>&1 || exit 0

LIST=$(mktemp)
trap 'rm -f "$LIST"' EXIT
find "$APP_DIR" -xdev \( ! -user "$APP_USER" -o ! -group "$APP_USER" \) -print0 2>/dev/null > "$LIST"
COUNT=$(tr -cd '\0' < "$LIST" | wc -c)
[ "$COUNT" -eq 0 ] && exit 0

SAMPLE=$(tr '\0' '\n' < "$LIST" | head -5 | while IFS= read -r p; do
  printf '%s(%s) ' "${p#$APP_DIR/}" "$(stat -c %U:%G "$p" 2>/dev/null)"
done)
xargs -0 -r chown -h "$APP_USER:$APP_USER" < "$LIST"
logger -p user.warning -t tokmatrix-owner-guard "Da tra $COUNT muc ve $APP_USER:$APP_USER: $SAMPLE"
echo "Da tra $COUNT muc ve $APP_USER:$APP_USER: $SAMPLE"
