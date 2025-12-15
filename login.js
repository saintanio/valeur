// Identifiants fixes (tu peux les changer)
const VALID_USER = "admin";
const VALID_PASS = "1234";

const loginBtn = document.getElementById("loginBtn");

loginBtn.addEventListener("click", () => {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!username || !password) {
        alert("Veuillez remplir tous les champs.");
        return;
    }

    if (username === VALID_USER && password === VALID_PASS) {

        // Sauvegarde simple de session
        localStorage.setItem("user", username);

        // Redirection vers l'app principale
        window.location.href = "index.html";
        
    } else {
        alert("Identifiants incorrects !");
    }
});
