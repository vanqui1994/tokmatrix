// Co chữ vừa khung cho mọi phần tử có data-fit (xác định: chạy một lần khi nạp + khi font sẵn sàng, không theo frame).
// Kịch bản Matrix dài hơn nội dung mẫu (tiếng Đức có từ ghép rất dài) nên chữ phải tự co chứ không được tràn.
export const FIT_SCRIPT = `<script data-variant-fit>
(function () {
  function fit(el) {
    var box = el.parentElement;
    if (!box) return;
    var min = Number(el.getAttribute("data-fit-min") || 18);
    if (!el.dataset.fitBase) el.dataset.fitBase = String(parseFloat(getComputedStyle(el).fontSize) || 40);
    var size = Number(el.dataset.fitBase);
    el.style.fontSize = size + "px";
    var cs = getComputedStyle(box);
    var innerW = box.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    var innerH = box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    // Đo theo vùng trong của khung cha: phần tử chữ có thể là flex item tự nở theo từ dài nhất.
    el.style.maxWidth = innerW + "px";
    function overflows() { return el.scrollWidth > innerW + 1 || el.offsetHeight > innerH + 1; }
    el.style.overflowWrap = "normal";
    // Một từ dài hơn cả dòng (từ ghép tiếng Đức) không được kéo cả khối xuống cỡ tí hon: tới "sàn đọc được"
    // (62% cỡ gốc) thì cho ngắt giữa từ rồi mới co tiếp tới data-fit-min.
    var floor = Math.max(min, Math.round(size * 0.62));
    while (size > floor && overflows()) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
    if (el.scrollWidth > innerW + 1) el.style.overflowWrap = "anywhere";
    while (size > min && overflows()) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
  }
  function fitAll() {
    var nodes = document.querySelectorAll("[data-fit]");
    for (var i = 0; i < nodes.length; i += 1) fit(nodes[i]);
  }
  fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
})();
</script>`;
