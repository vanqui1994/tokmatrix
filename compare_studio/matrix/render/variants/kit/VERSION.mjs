// Tăng khi primitive/profile của kit đổi hình ảnh đầu ra (video cũ giữ version cũ trong meta.creative).
// 5: gộp nhánh bộ da (trục caption, 9 tone, font tiêu đề + hoa văn theo nước) vào kit v4.
// 6: exit của transition kèm tl.set hard kill (hyperframes gsap_exit_missing_hard_kill).
// 7: sửa lỗi hyperframes check (gỡ clip-path sau reveal/transition, ẩn cảnh cũ ở mốc chuyển, nhãn giữa trên nền panel,
//    tem nghiêng 1.5°, frame isolation, CRT scanline nhạt hơn, data-fit đo bề rộng của chính phần tử − 3 px).
export const KIT_VERSION = 7;
