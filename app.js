const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const quoteText = document.getElementById('quoteText');

const quotes = [
  'Cada cliente atendido con excelencia crea una historia de confianza.',
  'Tus resultados mejoran cuando conviertes constancia en hábito diario.',
  'Una llamada bien hecha hoy puede cambiar el mes de una familia.',
  'La disciplina en seguimiento convierte oportunidades en cierres reales.',
  'Escuchar primero y orientar bien después siempre genera mejores acuerdos.'
];

let quoteIndex = 0;

function rotateQuote() {
  quoteIndex = (quoteIndex + 1) % quotes.length;
  quoteText.animate([{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }], {
    duration: 650,
    easing: 'ease-out'
  });
  quoteText.textContent = quotes[quoteIndex];
}

setInterval(rotateQuote, 5500);

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const payload = {
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || ''),
    remember: formData.get('remember') === 'on'
  };

  loginStatus.textContent = 'Validando credenciales...';

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Credenciales inválidas o servidor no disponible.');
    }

    loginStatus.textContent = 'Inicio de sesión correcto. Redirigiendo...';
  } catch (error) {
    loginStatus.textContent = `${error.message} (pendiente conexión backend/DB).`;
  }
});
