#!/usr/bin/env bash
# Chép đúng nội dung các file của một commit lên VPS (/opt/tokmatrix): sao lưu bản cũ vào /opt/tokmatrix-backups,
# giải nén không giữ owner của Mac, chown tokmatrix, đối chiếu md5. Không khởi động lại dịch vụ.
#   deploy/deploy_commit.sh [commit]      (mặc định HEAD; host ssh: TOKMATRIX_HOST, mặc định "tokmatrix")
# Cần bash ≥ 4 (mapfile): trên Mac chạy bằng /opt/homebrew/bin/bash.
set -euo pipefail
C=${1:-HEAD}
H=${TOKMATRIX_HOST:-tokmatrix}
SSH=${SSH:-/usr/bin/ssh}
SCP=${SCP:-/usr/bin/scp}
mapfile -t FILES < <(git diff-tree --no-commit-id --name-only -r "$C")
[ ${#FILES[@]} -gt 0 ] || { echo "commit $C không có file"; exit 1; }
D=$(mktemp -d "${TMPDIR:-/tmp}/dep.XXXX")
for f in "${FILES[@]}"; do mkdir -p "$D/$(dirname "$f")"; git show "$C:$f" > "$D/$f"; done
printf '%s\n' "${FILES[@]}" > "$D/.list"
"$SCP" -q "$D/.list" "$H:/tmp/dep_list"
B=/opt/tokmatrix-backups/deploy-$(date +%Y%m%d-%H%M%S)
"$SSH" "$H" "set -e; mkdir -p $B; cd /opt/tokmatrix; while IFS= read -r f; do [ -e \"\$f\" ] && echo \"\$f\"; done < /tmp/dep_list > /tmp/dep_exist; tar czf $B/files.tgz -T /tmp/dep_exist; echo backup \$(tar tzf $B/files.tgz | wc -l) files in $B"
(cd "$D" && COPYFILE_DISABLE=1 tar cf - "${FILES[@]}") | "$SSH" "$H" "set -e; cd /opt/tokmatrix; tar xf - --no-same-owner --no-overwrite-dir 2>/dev/null; while IFS= read -r f; do chown tokmatrix:tokmatrix \"\$f\"; d=\$(dirname \"\$f\"); while [ \"\$d\" != . ]; do chown tokmatrix:tokmatrix \"\$d\"; d=\$(dirname \"\$d\"); done; done < /tmp/dep_list"
bad=0
while IFS= read -r f; do
  l=$(md5 -q "$D/$f" 2>/dev/null || md5sum "$D/$f" | cut -c1-32); r=$("$SSH" "$H" "md5sum '/opt/tokmatrix/$f'" | cut -c1-32)
  [ "$l" = "$r" ] || { echo "MISMATCH $f"; bad=1; }
done < "$D/.list"
rm -rf "$D"
echo "deployed ${#FILES[@]} files, mismatch=$bad"
[ $bad -eq 0 ]
