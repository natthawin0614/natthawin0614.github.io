// code.js

// รอให้เว็บโหลดเสร็จก่อนทำงาน
document.addEventListener('DOMContentLoaded', () => {
    
    // เลือกทุก Element ที่มี class 'fade-in'
    const fadeElements = document.querySelectorAll('.fade-in');

    // สร้าง Observer เพื่อตรวจจับว่า element เข้ามาในหน้าจอหรือยัง
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            // ถ้า element โผล่เข้ามาในจอแล้ว
            if (entry.isIntersecting) {
                entry.target.classList.add('visible'); // เพิ่ม class visible เพื่อเริ่ม animation
            }
        });
    }, {
        threshold: 0.1 // ให้เห็นสัก 10% ของ element ก่อนค่อยแสดง
    });

    // สั่งให้ Observer เฝ้าดูทุก element
    fadeElements.forEach(el => observer.observe(el));

    // Console Log ทักทาย
    console.log("Welcome to Nattawin's Portfolio | Student ID: 67050168");
});