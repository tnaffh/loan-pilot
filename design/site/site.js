// Raccoons Financial Services — shared site scripts

// Payday loan calculator (runs only if present on the page)
(function () {
  var amt = document.getElementById('amt');
  var term = document.getElementById('term');
  if (!amt || !term) return;
  var amtOut = document.getElementById('amtOut');
  var termOut = document.getElementById('termOut');
  var monthly = document.getElementById('monthly');
  var total = document.getElementById('total');
  var rate = 0.30; // 30% per month, flat, for payday/short-term loans
  function fmt(n) { return 'N$ ' + Math.round(n).toLocaleString('en-US'); }
  function calc() {
    var P = +amt.value, n = +term.value;
    if (amtOut) amtOut.textContent = fmt(P);
    if (termOut) termOut.textContent = n + (n === 1 ? ' month' : ' months');
    var totalRepay = P * (1 + rate * n);
    if (monthly) monthly.textContent = fmt(totalRepay);
    if (total) total.textContent = fmt(totalRepay / n);
  }
  amt.addEventListener('input', calc);
  term.addEventListener('input', calc);
  calc();
})();

// FAQ accordion
document.querySelectorAll('.qa button').forEach(function (b) {
  b.addEventListener('click', function () {
    var qa = b.parentElement;
    var open = qa.classList.contains('open');
    var group = qa.parentElement;
    group.querySelectorAll('.qa').forEach(function (x) { x.classList.remove('open'); });
    if (!open) qa.classList.add('open');
  });
});

// Mobile nav toggle (if present)
(function () {
  var t = document.querySelector('.menu-toggle');
  var n = document.querySelector('.navlinks');
  if (t && n) t.addEventListener('click', function () { n.classList.toggle('open'); });
})();
