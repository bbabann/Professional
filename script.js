// 카드가 화면에 들어올 때 부드럽게 나타나게 함
const cards = document.querySelectorAll('.card');
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.style.opacity = 1;
      io.unobserve(e.target);
    }
  });
});
cards.forEach((c) => {
  c.style.opacity = 0;
  c.style.transition += ', opacity .6s';
  io.observe(c);
});
