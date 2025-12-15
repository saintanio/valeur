// main.js - POO + IndexedDB + CRUD complet (version corrigée / commentée)

class Database {
    constructor() {
        this.dbName = "edutech-boutique";
        this.version = 2;
        this.db = null;
    }

    init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.version);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                const stores = ["client", "produit", "stock", "paiements", "panier", "profil", "natcash"];
                stores.forEach(s => {
                    if (!db.objectStoreNames.contains(s)) {
                        db.createObjectStore(s, { keyPath: "id" });
                    }
                });
            };
            req.onsuccess = () => { this.db = req.result; resolve(); };
            req.onerror = (e) => reject(e);
        });
    }

    add(store, data) {
        data.id = this.IdUnique(store, data);
        data.createdAt = new Date().toLocaleString("sv-SE").replace(" ", "T");
        return new Promise((resolve, reject) => {
            try {
                const tx = this.db.transaction(store, "readwrite");
                const os = tx.objectStore(store);
                const payload = Object.assign({}, data);
                const r = os.add(payload);
                r.onsuccess = () => resolve(r.result);
                r.onerror = (e) => reject(e);
            } catch (err) {
                reject(err);
            }
        });
    }

    put(store, data) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.db.transaction(store, "readwrite");
                const os = tx.objectStore(store);
                const r = os.put(data);
                r.onsuccess = () => resolve(r.result);
                r.onerror = (e) => reject(e);
            } catch (err) {
                reject(err);
            }
        });
    }

    async delete(store, key) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.db.transaction(store, "readwrite");
                const r = tx.objectStore(store).delete(key);
                r.onsuccess = () => resolve();
                r.onerror = (e) => reject(e);
            } catch (err) {
                reject(err);
            }
        });
    }

    async importStockData(table, data) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.db.transaction(table, "readwrite");
                const store = tx.objectStore(table);

                data.forEach(item => {
                    store.add({
                        ...item,
                        id: Date.now() + Math.random() // générer un id unique
                    });
                });

                tx.oncomplete = () => resolve(true);
                tx.onerror = (e) => reject(e);
            } catch (err) {
                reject(err);
            }
        });
    }

    getAll(store) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.db.transaction(store, "readonly");
                const r = tx.objectStore(store).getAll();
                r.onsuccess = () => resolve(r.result || []);
                r.onerror = (e) => reject(e);
            } catch (err) {
                reject(err);
            }
        });
    }

    get(store, key) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.db.transaction(store, "readonly");
                const r = tx.objectStore(store).get(key);
                r.onsuccess = () => resolve(r.result);
                r.onerror = (e) => reject(e);
            } catch (err) {
                reject(err);
            }
        });
    }
    getStore(mode = "readonly") {
        return this.db.transaction("natcash", mode).objectStore("natcash");
    }
    async isInStock(produitId) {
        const stock = await this.getAll("stock");
        return stock.some(item => String(item.produit) === String(produitId));
    }

    async getPaniersByClient(clientId) {
        const paniers = await this.getAll("panier"); // ou table équivalente
        return paniers.filter(p => p.client == clientId && p.total > 0);
    }

    async isProduitInPanier(produitId) {
        const paniers = await this.getAll("panier");
        // retourne true si au moins un panier contient le produit
        return paniers.some(p => p.items && p.items.some(item => String(item.produit) === String(produitId)));
    }

    IdUnique(store, data) {

        let today = new Date().toLocaleString("sv-SE").replace(" ", "T");
        let d = today.split("T")[0];
        let h = today.split("T")[1];
        d = d.split("-");
        h = h.split(":");
        let jour = `${d[1]}${d[2]}${h[0]}${h[1]}`

        if (store === "produit") {
            const base = `${data.designation}${data.pu}`;
            return this._hash(base);
        }
        else if (store === "panier") {
            const base = `${data.client}_${jour}`;
            return this._hash(base);
        }
        else if (store === "stock") {
            const base = `${data.produit}_${jour}`;
            return this._hash(base);
        }
        else if (store === "client") {
            return `${data.telephone}`;
        }
        else if (store === "paiements") {
            return `${data.panier}_${jour}`;
        }
        else {
            afficherMessage(`${store} inexistant`)
        }

    }

    _hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = (h << 5) - h + str.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h).toString().padStart(10, "1");
    }

    async addNaCashPayment(panierId, montant, par = "NaCash") {
        const now = new Date().toISOString();

        // 1. Construire le paiement
        const paiement = {
            id: panierId + "_" + Date.now(),   // Id unique
            montant,
            panier: panierId,
            par,
            createdAt: now
        };

        // 2. Enregistrer dans store paiements
        await this.db.put("paiements", paiement);

        // 3. Mettre le panier à jour
        const panier = await this.db.get("panier", panierId);

        if (!panier) return; // gestion silencieuse

        panier.paye = (Number(panier.paye) || 0) + montant;
        panier.reste = (Number(panier.total) || 0) - panier.paye;

        await this.db.put("panier", panier);
    }

    // Comment l’utiliser
    // await addNaCashPayment("1447692520", 500);

}

class FormBuilder {
    constructor(navigation) {
        this.navigation = navigation;
    }

    async createForm(section, data = null) {
        const config = this.navigation.configuration()[section];
        if (!config) return "<p class='small'>Aucune configuration pour cette section.</p>";

        let html = "";

        for (let f of config) {
            // ID UNIQUE = section + "_" + id
            const fieldId = `${section}_${f.id}`;

            // valeur si édition ; form fields use 'name' as key in FormData
            const value = data && (data[f.name] !== undefined) ? data[f.name] : "";

            if (f.type === "hidden") {
                html += `
                <input type="hidden" 
                       name="${f.name}" 
                       id="${fieldId}" 
                       value="${value}">
                `;
            } else if (f.type === "select") {
                html += `
                <label for="${fieldId}">${f.placeholder || f.name}</label>
                <select id="${fieldId}" 
                        name="${f.name}"
                        ${f.required ? "required" : ""}>
                    <option value="">Chargement...</option>
                </select>
                `;
            } else {
                html += `
                <label for="${fieldId}">${f.placeholder || f.name}</label>
                <input 
                    type="${f.type}" 
                    id="${fieldId}" 
                    name="${f.name}"
                    placeholder="${f.placeholder || ""}"
                    ${f.required ? "required" : ""}
                    ${f.min ? `min="${f.min}"` : ""}
                    value="${value}"
                />
                `;
            }
        }

        html += `
        <button class="btn" type="submit">
            ${data ? "Mettre à jour" : "Enregistrer"}
        </button>
        `;

        return `<form id="form-${section}" class="form">${html}</form>`;
    }

    async populateSelects(section, data = null) {
        const config = this.navigation.configuration()[section];
        if (!config) return;
        for (let f of config) {
            if (f.type === "select" && f.optionsFrom) {
                const items = await this.navigation.db.getAll(f.optionsFrom);
                const sel = document.getElementById(`${section}_${f.id}`);
                if (!sel) continue;
                sel.innerHTML = `<option value="">-- Choisir --</option>`;
                items.forEach(i => {
                    const opt = document.createElement("option");
                    opt.value = i.id;
                    opt.textContent = i.designation || i.nom || (`item ${i.id}`);
                    sel.appendChild(opt);
                });
                if (data && data[f.name]) sel.value = data[f.name];
            }
        }
    }
}

function parseDate(d) {
    if (!d) return 0;

    // Si déjà un timestamp
    if (typeof d === "number") return d;

    // Si string ISO "2025-11-21T15:40:00"
    const t = Date.parse(d);
    if (!isNaN(t)) return t;

    return 0;
}


class Navigation {
    constructor() {
        this.links = {
            produit: document.getElementById("produit"),
            stock: document.getElementById("stock"),
            client: document.getElementById("client"),
            transaction: document.getElementById("transaction"),
            paiements: document.getElementById("paiements"),
            profil: document.getElementById("profil"),
            new: document.getElementById("new")
        };
        this.content = document.getElementById("content");
        this.db = new Database();
        this.activeSection = "home";
        this.formBuilder = new FormBuilder(this);
    }

    configuration() {
        return {
            client: [
                { name: "nom", id: "nom", type: "text", placeholder: "Nom du client", required: true },
                { name: "prenom", id: "prenom", type: "text", placeholder: "Prenom du client", required: true },
                { name: "telephone", id: "telephone", type: "text", placeholder: "Telephone du client", required: true },
                { name: "ninu", id: "ninu", type: "text", placeholder: "NINU du client" },
                { name: "adresse", id: "adresse", type: "text", placeholder: "Adresse du client" }
            ],
            panier: [
                { name: "code", id: "code", type: "hidden" },
                { name: "montant", id: "montant", type: "hidden" },
                { name: "balance", id: "balance", type: "hidden" },
                { name: "date", id: "date", type: "hidden", required: true }
            ],
            produit: [
                { name: "designation", id: "designation", type: "text", placeholder: "Designation du produit", required: true },
                { name: "pu", id: "pu", type: "number", placeholder: "Prix unitaire", min: 1, required: true }
            ],
            stock: [
                { name: "produit", id: "produit", type: "select", optionsFrom: "produit", required: true },
                { name: "quantite", id: "quantite", type: "number", placeholder: "Quantité achetée", min: 1, required: true },
                { name: "prix", id: "prix", type: "number", placeholder: "Prix d'achat", min: 1, required: true }
            ],
            paiements: [
                { name: "montant", id: "montant", type: "number", min: "10", placeholder: "montant", required: true },
                { name: "panier", id: "panier", type: "hidden" },
                { name: "par", id: "par", type: "text", placeholder: "par client" },
                { name: "date", id: "date", type: "hidden", required: true }
            ],

        };
    }

    async init() {
        try {
            await this.db.init();
            this.initEvents();
            this.openSection(this.activeSection);
        } catch (err) {
            console.error("Erreur init DB:", err);
            this.content.innerHTML = "<p>Impossible d'initialiser la base de données.</p>";
        }
    }

    initEvents() {
        if (this._eventsInitDone) return;  // <--- empêche double attachement
        this._eventsInitDone = true;

        Object.keys(this.links).forEach(key => {
            const el = this.links[key];
            if (!el) return;
            el.addEventListener("click", (e) => {
                e.preventDefault();
                if (key === "new") {
                    this.openNew();
                } else {
                    this.openSection(key);
                }
            });
        });


        this.content.addEventListener("click", async (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;

            // EDIT
            if (btn.classList.contains("btn-edit")) {
                if (!btn.id.startsWith("edit-")) return;
                const parts = btn.id.split("-");
                const sec = parts[1];
                const id = parts.slice(2).join("-");

                return this.openEdit(sec, id);
            }

            if (btn.classList.contains("btn-del")) {
                if (!btn.id.startsWith("del-")) return;

                const parts = btn.id.split("-");
                const sec = parts[1]; // "produit" ou "client" ou "stock"
                const id = parts.slice(2).join("-");

                e.stopPropagation(); // empêche la boucle de clics


                if (sec === "produit") {
                    // Vérifie si le produit est déjà en stock
                    const estEngage = await this.db.isInStock(id);
                    if (estEngage) {
                        this.afficherMessage("Impossible de supprimer ce produit : il est déjà mis en stock !");
                        return;
                    }
                }
                else if (sec === "client") {
                    const paniers = await this.db.getPaniersByClient(id);
                    if (paniers.length > 0) {
                        this.afficherMessage("Impossible de supprimer ce client : il possède au moins un panier non vide !");
                        return;
                    }
                }
                else if (sec === "stock") {

                    // On doit charger le stock pour obtenir l'ID DU PRODUIT
                    const stockItem = await this.db.get("stock", id);
                    if (!stockItem) return;

                    const produitId = stockItem.produit; // <--- LA CLÉ IMPORTANTE

                    const dansPanier = await this.db.isProduitInPanier(produitId);
                    if (dansPanier) {
                        this.afficherMessage("Impossible de supprimer ce stock : le produit existe dans au moins un panier !");
                        return;
                    }
                }


                if (!confirm(`Supprimer cet ${sec} ?`)) return;

                await this.db.delete(sec, id);
                return this.render(sec, this.page);
            }


        });


    }

    setActiveVisual(section) {
        document.querySelectorAll(".tablinks").forEach(a => a.classList.remove("active"));
        if (this.links[section] && this.links[section].classList.contains("tablinks")) {
            this.links[section].classList.add("active");
        }
    }

    async openSection(section) {
        this.activeSection = section;
        this.toggleSearchBar(section);
        this.setActiveVisual(section);

        // Cas spéciaux : commande + livraison → n’utilisent PAS render()
        if (section === "commande") {
            await this.renderListe("commande", "all", 1);
            return;
        }

        if (section === "livraison") {
            await this.renderListe("livraison", "all", 1);
            return;
        }
        if (section === "profil") {
            await this.renderProfilEntreprise();
            return;
        }

        if (section === "home") {
            await this.openHome();
            return;
        }

        await this.render(section);

        const searchInput = document.getElementById("globalSearch");

        if (searchInput) {
            searchInput.value = "";
            searchInput.placeholder = "Filtrer...";

            searchInput.oninput = () => {
                const term = searchInput.value.toLowerCase();

                const lignes = document.querySelectorAll(".table .row:not(.header)");

                lignes.forEach(ligne => {
                    const texte = ligne.textContent.toLowerCase();
                    ligne.style.display = texte.includes(term) ? "" : "none";
                });
            };
        }

    }

    async openNew() {
        await this.renderNewForm();
    }

    async render(section, page = 1) {
        const perPage = 10;
        let list = [];
        try {
            list = await this.db.getAll(section);
        } catch (err) {
            console.error("render getAll error:", err);
            list = [];
        }

        const total = list.length;
        const totalPages = Math.ceil(total / perPage);
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;

        const start = (page - 1) * perPage;
        const end = start + perPage;
        const pagedList = list.slice(start, end);

        if (!list.length && section) {
            this.content.innerHTML = `<p class='small'>Aucun ${section} trouvé.</p>`;
            return;
        }
        if (!list.length) {
            await this.openHome();
            return;
        }

        const title = section.charAt(0).toUpperCase() + section.slice(1);
        const fields = Object.keys(list[0]).filter(f => f !== "id");
        let champs = fields.map(f => `<div>${f}</div>`).join("");

        this.content.innerHTML = `
        <div class="header">
            <h2>${title}</h2>
        </div>

        <div id="liste-${section}" class="table">
            <div class="row header">
                ${champs}
                <div>Action</div>
            </div>
            ${pagedList.map(item => this.renderItemCard(section, item)).join("")}
        </div>

        <!-- PAGINATION -->
        <div class="pagination">
            <button id="btn-prev" ${page <= 1 ? "disabled" : ""}>◀ Précédent</button>
            <span>Page ${page} / ${totalPages}</span>
            <button id="btn-next" ${page >= totalPages ? "disabled" : ""}>Suivant ▶</button>
        </div>
    `;

        // --- PAGINATION EVENTS ---
        document.getElementById("btn-prev")?.addEventListener("click", () => {
            this.render(section, page - 1);
        });
        document.getElementById("btn-next")?.addEventListener("click", () => {
            this.render(section, page + 1);
        });

        // boutons spéciaux NEW
        const btnNew = document.getElementById("btn-new");
        if (btnNew) {
            btnNew.addEventListener("click", e => { e.preventDefault(); this.openNew(); });
        }

        // boutons panier pour clients
        if (section === "client") {
            pagedList.forEach(item => {
                const pBtn = document.getElementById(`panier-${item.id}`);
                if (pBtn) pBtn.addEventListener("click", () => this.renderListePaniersClient(item.id));
            });
        }
    }


    renderItemCard(section, item) {
        let fields = this.configuration()[section];
        const names = fields.map(f => f.name);
        let arr2 = Object.keys(item);
        const missing = arr2.filter(x => !names.includes(x) && x !== "id"); // ce qui manque
        names.push(...missing); // on les ajoute


        let extraBtn = "";
        if (section === "client") {
            extraBtn = `<button id="panier-${item.id}" class="btn-edit" style="color:#16a34a">🛍️</button>`;
        }
        // console.log(this.configuration().section);
        // console.log(missing);
        let ligne = `<div class="row">`;
        for (let key in names) {
            if (key === 'id') continue;
            ligne += `<div>${item[names[key]]}</div>`;
        }
        ligne += `<div>
                ${extraBtn}
                <button id="edit-${section}-${item.id}" class="btn-edit">🖉</button>
                <button id="del-${section}-${item.id}" class="btn-del">🗑</button>
        </div></div>`;
        return ligne;
    }


    async openEdit(section, id) {
        try {
            const data = await this.db.get(section, id);
            if (!data) return this.afficherMessage("Élément introuvable.");
            await this.renderNewForm(data);
        } catch (err) {
            console.error("openEdit error:", err);
            this.afficherMessage("Erreur lors de l'ouverture de l'édition.");
        }
    }

    async renderNewForm(data = null) {
        const section = this.activeSection;
        const title = data ? `Modifier ${section}` : `Ajouter ${section}`;
        const formHTML = await this.formBuilder.createForm(section, this._mapDataForForm(data));
        this.content.innerHTML = `<div class="header"><h2>${title}</h2></div>${formHTML}`;

        // populate selects (with selection if edit)
        await this.formBuilder.populateSelects(section, this._mapDataForForm(data));

        // if livraison, set hidden date = today on new (FIX: use section-prefixed id)
        if (!data) {
            const cfg = this.configuration()[section] || [];
            const dateFld = cfg.find(f => f.id === "date");
            if (dateFld) {
                const el = document.getElementById(`${section}_date`);
                if (el) el.value = new Date().toISOString();
            }
        }

        const form = document.getElementById(`form-${section}`);
        if (!form) return;

        form.onsubmit = async (e) => {
            e.preventDefault();
            const fd = Object.fromEntries(new FormData(e.target));

            // convertir nombres based on field configuration using 'name'
            Object.keys(fd).forEach(k => {
                const cfg = (this.configuration()[section] || []).find(f => f.name === k);
                if (cfg && cfg.type === "number" && fd[k] !== "") fd[k] = Number(fd[k]);
            });

            // Pre-save validation (ex: stock) -> must run BEFORE writing to DB
            const ok = await this._preSaveValidate(section, fd);
            if (!ok) return;

            try {
                if (data && data.id) {
                    fd.id = data.id;
                    await this.db.put(section, fd);
                } else {
                    const newId = await this.db.add(section, fd);
                    fd.id = newId;
                }

                // post-save (update panier totals, lier paiement, etc.)
                await this._postSaveHook(section, fd);

                // this.afficherMessage("Enregistré.");
                this.render(section);
            } catch (err) {
                console.error("Erreur lors de l'enregistrement:", err);
                this.afficherMessage("Impossible d'enregistrer.");
            }
        };
    }

    async renderProfilEntreprise() {

        // Structure des champs
        const profilFields = [
            { label: "Nom de l'entreprise", name: "nom", type: "text" },
            { label: "Adresse", name: "adresse", type: "text" },
            { label: "Téléphone", name: "telephone", type: "text" },
            { label: "Email", name: "email", type: "email" },
            { label: "NIF", name: "nif", type: "text" },
            { label: "DG", name: "dg", type: "text" },
            { label: "Description", name: "description", type: "textarea", full: true }
        ];

        // 💡 Efface la zone de contenu (comme tes autres sections)
        this.content.innerHTML = "";

        // Conteneur principal
        const form = document.createElement("form");
        form.className = "form-profil";

        // Titre
        const title = document.createElement("h2");
        title.textContent = "Profil de l'entreprise";
        form.appendChild(title);

        // Grille 2 colonnes
        const grid = document.createElement("div");
        grid.className = "form-grid";
        form.appendChild(grid);

        // Génération dynamique des champs
        profilFields.forEach(field => {

            const wrapper = document.createElement("div");
            wrapper.className = "form-group";
            if (field.full) wrapper.classList.add("full-width");

            const label = document.createElement("label");
            label.textContent = field.label;

            let input;
            if (field.type === "textarea") {
                input = document.createElement("textarea");
                input.rows = 3;
            } else {
                input = document.createElement("input");
                input.type = field.type;
            }

            input.name = field.name;

            wrapper.appendChild(label);
            wrapper.appendChild(input);
            grid.appendChild(wrapper);
        });

        // Bouton aligné à droite
        const btnContainer = document.createElement("div");
        btnContainer.className = "btn-container";

        const btn = document.createElement("button");
        btn.type = "submit";
        btn.className = "btn-primary";
        btn.textContent = "Enregistrer";

        btnContainer.appendChild(btn);
        grid.appendChild(btnContainer);

        // Action soumission
        form.addEventListener("submit", e => {
            e.preventDefault();

            const data = {};
            profilFields.forEach(f => {
                data[f.name] = form.querySelector(`[name="${f.name}"]`).value;
            });

            console.log("Profil enregistré :", data);

            this.afficherMessage("Profil enregistré avec succès !");
        });

        // Injection dans ta zone principale
        this.content.appendChild(form);
    }


    _mapDataForForm(data) {
        if (!data) return null;
        return Object.assign({}, data);
    }

    async _preSaveValidate(section, record) {
        // Validate transaction stock BEFORE saving
        if (section === "transaction") {
            const produitId = record.produit;
            const quantite = Number(record.quantite) || 0;
            if (!produitId || quantite <= 0) {
                this.afficherMessage("Produit ou quantité invalide.");
                return false;
            }

            // calc stock dispo
            const stocks = await this.db.getAll("stock");
            const stockTotal = stocks
                .filter(s => s.produit == produitId)
                .reduce((a, b) => a + (Number(b.quantite) || 0), 0);

            const transactions = await this.db.getAll("transaction");
            const vendu = transactions
                .filter(t => t.produit == produitId)
                .reduce((a, b) => a + (Number(b.quantite) || 0), 0);

            const dispo = stockTotal - vendu;
            if (quantite > dispo) {
                this.afficherMessage(`Stock insuffisant ! Disponible : ${dispo}`);
                return false;
            }
        }

        // other validations can be added (livraison maxFromStock, paiements amount positive, etc.)
        if (section === "paiements") {
            const montant = Number(record.montant) || 0;
            if (montant <= 0) {
                this.afficherMessage("Montant de paiement invalide.");
                return false;
            }
        }

        return true;
    }

    async _postSaveHook(section, savedRecord) {
        try {
            if (section === "paiements") {
                if (savedRecord.panier) {
                    const p = await this.db.get("panier", savedRecord.panier);
                    if (p) {
                        p.paye = (Number(p.paye) || 0) + Number(savedRecord.montant || 0);
                        p.reste = (Number(p.total) || 0) - p.paye;
                        await this.db.put("panier", p);
                    }
                }
            }

            if (section === "stock") {
                // nothing special here; stock entry already created in store
            }

            if (section === "livraison") {
                // If needed: mark shipment, decrement stock, etc. (domain logic)
            }

            if (section === "transaction") {
                // transaction saved -> update related panier totals if there's a panier id
                if (savedRecord.panier) {
                    const p = await this.db.get("panier", savedRecord.panier);
                    if (p) {
                        // potentially add transaction item to panier
                        const produit = await this.db.get("produit", savedRecord.produit);
                        const price = produit ? produit.pu : 0;
                        const item = {
                            id: Date.now(),
                            produit: savedRecord.produit,
                            designation: produit ? produit.designation : "Produit",
                            prix: price,
                            quantite: Number(savedRecord.quantite || 0)
                        };
                        p.items = p.items || [];
                        p.items.push(item);
                        p.total = p.items.reduce((s, i) => s + (i.quantite * i.prix), 0);
                        p.reste = p.total - (p.paye || 0);
                        await this.db.put("panier", p);
                    }
                }
            }

        } catch (err) {
            console.error("_postSaveHook error:", err);
        }
    }

    async _getProduitPrice(produitId) {
        if (!produitId) return 0;
        const p = await this.db.get("produit", produitId);
        return p ? p.pu : 0;
    }

    async openPanier(clientId) {
        this.activeSection = "panier";

        // récupérer ou créer panier pour ce client : prefer to find an open panier first
        const paniers = await this.db.getAll("panier");
        let panier = paniers.find(p => p.client == clientId && (Number(p.reste) || 0) > 0);

        if (!panier) {
            // pas de panier ouvert => en créer un
            const newPanier = {
                client: clientId,
                total: 0,
                paye: 0,
                reste: 0,
                items: [],
                createdAt: new Date().toLocaleString("sv-SE").replace(" ", "T")
            };
            const id = await this.db.add("panier", newPanier);
            panier = await this.db.get("panier", id);
            console.log(newPanier);
        }

        this.renderPanierView(panier);
    }

    async renderListePaniersClient(clientId) {
        let paniers = await this.db.getAll("panier");
        paniers = paniers.filter(p => p.client == clientId);

        if (paniers.length === 0) {
            this.content.innerHTML = `
            <h2>Paniers du client #${clientId}</h2>
            <p>Aucun panier trouvé.</p>
            <button id="newPanier" class="btn">➕ Nouveau panier</button>
            `;
            const btn = document.getElementById("newPanier");
            if (btn) btn.onclick = () => this.createNewPanierFor(clientId);
            return;
        }

        let html = `<h2>Paniers du client #${clientId}</h2>`;
        html += `<button id="newPanier" class="btn nouveau">➕ Nouveau panier</button><div class="list">`;
        html += `
   <table class="table">
    <tr class="header">
        <th>Panier</th>
        <th>Total</th>
        <th>Payé</th>
        <th>Reste</th>
        <th>Action</th>
    </tr>
        `;

        paniers.forEach(p => {
            const reste = Number(p.total || 0) - Number(p.paye || 0);
            const pourcentage = p.total === 0 ? 0 : Math.round((p.paye / p.total) * 100);

            html += `
                <tr>
                    <td data-open-panier="${p.id}">#${p.id}</td>
                    <td>${p.total}</td>
                    <td>${p.paye}</td>
                    <td>${reste}</td>
                    <td>
                    <button class=" open-panier btn-edit" data-id="${p.id}">👁️</button>
                    ${(!p.items || p.items.length === 0) ? `<button class="btnDeletePanier" data-id="${p.id}">🗑Supprimer</button>` : ""}                   
                    </td>
                </tr>
                <tr>
                    <td colspan="5" style="text-align:center">
                <div style="background:#e5e7eb;height:6px;border-radius:6px;margin-top:0px">
                    <div style="height:100%;width:${pourcentage}%;background:#2563eb;border-radius:6px"></div>
                </div>                    
                    </td>
                </tr>

            `;
        });

        html += `</table>`;
        this.content.innerHTML = html;

        const btnNew = document.getElementById("newPanier");
        if (btnNew) btnNew.onclick = () => this.createNewPanierFor(clientId);

        // delegation for open and delete buttons
        this.content.querySelectorAll('.open-panier').forEach(b => {
            b.onclick = async () => {
                const id = b.dataset.id;
                const panier = await this.db.get("panier", id);
                if (panier) this.renderPanierView(panier);
            };
        });

        // single delegated listener for delete buttons inside this.content
        this.content.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btnDeletePanier');
            if (!btn) return;
            e.stopPropagation();
            const panierId = btn.dataset.id;
            const panier = await this.db.get('panier', panierId);
            if (!panier) return;
            if (!panier.items || panier.items.length === 0) {
                await this.db.delete('panier', panierId);
                this.renderListePaniersClient(clientId);
            } else {
                this.afficherMessage("Impossible de supprimer un panier avec des articles !");
            }
        }, { once: false });
    }

    async createNewPanierFor(clientId) {
        // check existing open panier BEFORE creating
        const paniers = await this.db.getAll("panier");
        const ouvert = paniers.find(p => p.client == clientId && (Number(p.reste) || 0) > 0);

        if (ouvert) {
            this.afficherMessage("Ce client a déjà un panier ouvert (#" + ouvert.id + ").");
            this.renderPanierView(ouvert);
            return;
        }

        // create new panier
        const newPanier = {
            client: clientId,
            total: 0,
            paye: 0,
            reste: 0,
            items: [],
            createdAt: new Date().toLocaleString("sv-SE").replace(" ", "T")
        };

        const id = await this.db.add("panier", newPanier);
        newPanier.id = id;

        this.renderPanierView(newPanier);
    }


    async renderPanierView(panier) {
        // --- UTILITAIRE POUR FORMATER LA DATE ---
        const formatDateFR = isoString => {
            if (!isoString) return "-";
            const d = new Date(isoString);
            const pad = n => n.toString().padStart(2, '0');
            const day = pad(d.getDate());
            const month = pad(d.getMonth() + 1);
            const year = d.getFullYear();
            const hours = pad(d.getHours());
            const minutes = pad(d.getMinutes());
            const seconds = pad(d.getSeconds());
            return `${day}-${month}-${year} à ${hours}:${minutes}:${seconds}`;
        };

        // --- ASSURER LES VALEURS NUMÉRIQUES ---
        panier.total = Number(panier.total || 0);
        panier.paye = Number(panier.paye || 0);
        panier.reste = Number(panier.reste || (panier.total - panier.paye));
        panier.items = panier.items || [];

        const pourcentage = panier.total === 0 ? 0 : Math.round((panier.paye / panier.total) * 100);

        // --- RÉCUPÉRER TOUS LES PAIEMENTS ---
        const paiements = await this.db.getAll("paiements");
        const paiementsPanier = paiements.filter(p => String(p.panier) === String(panier.id));

        const paiementsHTML = paiementsPanier.length === 0
            ? "<p class='small'>Aucun paiement</p>"
            : `
    <div class="table">
        <div class="row header">
            <div>Montant</div>
            <div>Par</div>
            <div>Date</div>
        </div>
        ${paiementsPanier.map(p => `
        <div class="row">
            <div>${p.montant} HTG</div>
            <div>${p.par || '-'}</div>
            <div>${formatDateFR(p.createdAt)}</div>
        </div>
        `).join('')}
    </div>
    `;


        // --- HTML PRINCIPAL ---
        this.content.innerHTML = `
    <div id="panierZone">
        <h2>Panier #${panier.id} du client #${panier.client}</h2>

        <div style="margin-top:10px;margin-bottom:10px">
            <div style="background:#e5e7eb;height:8px;border-radius:6px;margin-top:5px;">
                <div style="
                    height:100%;
                    width:${pourcentage}%;
                    background:#2563eb;
                    border-radius:6px">
                </div>
            </div>
        <div id="liste-client" class="table" style="margin-top:12px">
            <div class="row header">
                <div>Produit</div>
                <div>Quantité</div>
                <div>Prix</div>
                <div>Montant</div>
                <div>Livré</div>
                <div class="col-action">Action</div>
            </div>

            ${panier.items.length === 0
                ? `<div class="row"><div class="cell" colspan="5">Aucun article</div></div>`
                : panier.items.map(i => `
                    <div class="row ${i.delivered ? "row-delivered" : ""}">
                        <div>${i.designation}</div>
                        <div>${i.quantite}</div>
                        <div>${i.prix}</div>
                        <div>${i.quantite * i.prix}</div>

                        <div>
                            <label style="display:flex;align-items:center;gap:4px;cursor:pointer">
                                <input type="checkbox" class="chk-delivery"
                                    data-id="${i.id}"
                                    ${i.delivered ? "checked" : ""}>
                            </label>
                        </div>

                        <div class="col-action">
                            <button class="btn-del-item" data-id="${i.id}">⛔</button>
                        </div>
                    </div>
                `).join("")
            }
        </div>

        <div class="resume">
        <div class="row">
            <div class="label header">Total</div>
            <div class="value"><b>${this.formatMonetaire(panier.total)}</b></div>
        </div>

        <div class="row">
            <div class="label header">Payé</div>
            <div class="value"><b>${this.formatMonetaire(panier.paye)}</b></div>
        </div>

        <div class="row">
            <div class="label header">Reste</div>
            <div class="value"><b>${this.formatMonetaire(panier.reste)}</b></div>
        </div>
        </div>

        </div>
</div>

<div class="btn-bar">
  <button id="addItem" class="btn">Ajouter un article</button>
  <button id="btnPay" class="btn btn-green">💵 Payer</button>
  <button id="btnHistory" class="btn btn-blue">📜 Historique</button>
  <button id="btnPrint" class="btn btn-orange">🖨️ Imprimer</button>
</div>

<h3>Paiements</h3>
<div class="list" style="margin-top:6px">
    ${paiementsHTML}
</div>
`;

        // --- EVENTS ---

        // Ajouter un article
        const addBtn = document.getElementById("addItem");
        if (addBtn) addBtn.onclick = () => this.openAddItem(panier.id);

        // Historique des paiements
        const histBtn = document.getElementById("btnHistory");
        if (histBtn) histBtn.onclick = () => this.renderHistoriquePaiements(panier.id);

        // Supprimer un item du panier
        this.content.querySelectorAll('.btn-del-item').forEach(btn => {
            btn.onclick = async () => {
                const itemId = btn.dataset.id;
                const item = panier.items.find(x => x.id == itemId);

                // Vérifier si l'item est déjà livré
                if (item?.delivered) {
                    this.afficherMessage("Cet article a déjà été livré et ne peut pas être supprimé !");
                    return; // annuler la suppression
                }

                // Confirmation avant suppression
                const ok = confirm("Voulez-vous vraiment supprimer cet article ?");
                if (!ok) return;

                // Suppression et recalcul
                panier.items = panier.items.filter(x => String(x.id) !== String(itemId));
                await this._recomputePanier(panier);
                this.renderPanierView(panier);
            };
        });



        document.getElementById("btnPrint").addEventListener("click", () => {
            window.print();
        });

        // Checkbox Livré
        this.content.querySelectorAll('.chk-delivery').forEach(chk => {
            chk.onchange = async () => {
                const itemId = chk.dataset.id;
                const item = panier.items.find(x => x.id == itemId);
                console.log(item, panier);
                if (item) {
                    item.delivered = chk.checked;
                    item.deliveredAt = chk.checked ? new Date().toLocaleString("sv-SE").replace(" ", "T") : null;
                    await this.db.put("panier", panier);
                }
                this.renderPanierView(panier);
            };
        });

        // Paiement
        const payBtn = document.getElementById("btnPay");
        if (payBtn) {
            payBtn.onclick = () => {
                this.activeSection = "paiements";

                this.content.innerHTML = `
                <div class="pay-container">

                    <div class="pay-header">
                        <h2>Paiement du panier #${panier.id}</h2>
                        <button id="btnRetourPanier" class="btn-retour">
                            ⬅ Retour au panier
                        </button>
                    </div>

                    <form id="form-pay" class="pay-form">

                        <div class="form-row">
                            <label>Montant (reste : ${panier.reste} HTG)</label>
                            <input type="number" name="montant" required min="10" max="${panier.reste}">
                        </div>

                        <input type="hidden" name="panier" value="${panier.id}">

                        <div class="form-row">
                            <label>Par</label>
                            <input type="text" name="par" placeholder="Nom du client">
                        </div>

                        <div class="form-actions">
                            <button class="btn" type="submit">Valider</button>
                        </div>

                    </form>

                </div>
                `;

                document.getElementById("btnRetourPanier").onclick = () => {
                    this.renderPanierView(panier);
                };

                // Soumission paiement
                document.getElementById("form-pay").onsubmit = async (e) => {
                    e.preventDefault();
                    const fd = Object.fromEntries(new FormData(e.target));
                    fd.montant = Number(fd.montant);

                    if (fd.montant <= 0) return this.afficherMessage("Montant invalide.");
                    if (fd.montant > panier.reste) return this.afficherMessage(`Montant trop élevé ! Maximum : ${panier.reste} HTG`);

                    // ajouter date
                    fd.createdAt = new Date().toISOString();

                    // enregistrer le paiement
                    await this.db.add("paiements", fd);

                    // mise à jour panier
                    panier.paye += fd.montant;
                    panier.reste = panier.total - panier.paye;
                    await this.db.put("panier", panier);

                    this.afficherMessage("Paiement enregistré !");
                    this.renderPanierView(panier);
                };
            };
        }
    }

    async openAddItem(panierId) {
        const produits = await this.db.getAll("produit");
        if (!produits || produits.length === 0) {
            this.afficherMessage("Aucun produit disponible.");
            return;
        }

        // récupérer le panier actuel
        const panier = await this.db.get("panier", panierId);
        if (!panier) return this.afficherMessage("Panier introuvable.");




        // charger stock et paniers avant de générer le HTML
        const stocks = await this.db.getAll("stock");
        const paniers = await this.db.getAll("panier");

        // créer HTML pour toutes les cartes
        this.content.innerHTML = `
    <h2>Ajouter des articles</h2>
    <div class="product-list" style="display:flex;flex-wrap:wrap;gap:10px">
        ${produits.map(p => {

            // 1️⃣ STOCK TOTAL pour ce produit (somme)
            const stockTotal = stocks
                .filter(s => s.produit == p.id)
                .reduce((a, b) => a + Number(b.quantite), 0);

            // 2️⃣ QUANTITÉS ENGAGÉES dans TOUS LES PANIERS
            const engage = paniers.reduce((total, panier) => {
                const qteDansPanier = (panier.items || [])
                    .filter(item => item.produit == p.id)
                    .reduce((somme, item) => somme + Number(item.quantite), 0);
                return total + qteDansPanier;
            }, 0);

            // 3️⃣ DISPONIBLE = STOCK - ENGAGE
            const disponible = stockTotal - engage;

            // 4️⃣ QUANTITÉ DÉJÀ DANS LE PANIER CIBLE
            const itemInPanier = (panier.items || [])
                .find(it => it.produit == p.id);

            const badgeText = itemInPanier
                ? `Added ${itemInPanier.quantite}`
                : "Nouveau";

            return `
                <div class="card">
                    <div class="badge">${badgeText}</div>
                    <div class="title">${p.designation}</div>
                    <div class="price">Prix : ${p.pu} HTG</div>

                    <div class="stock">
                        Disponible : <strong>${disponible}</strong>
                    </div>

                    <div class="action-row">
                        <input type="number" min="1" max="${disponible}" value="1"
                            class="qty" id="qty-${p.id}">
                        <button class="btn-add-product" data-id="${p.id}">🛒</button>
                    </div>
                </div>
            `;
        }).join('')}

    </div>

    <button id="backToPanier" class="btn" style="margin-top:10px">
        ⬅ Retour au panier
    </button>
`;

        // gérer ajout de produit
        this.content.querySelectorAll('.btn-add-product').forEach(btn => {
            btn.onclick = async () => {
                const produitId = btn.dataset.id;
                const qtyEl = document.getElementById(`qty-${produitId}`);
                const q = Number(qtyEl.value);
                if (!q || q <= 0) { this.afficherMessage("Quantité invalide."); return; }

                const produit = await this.db.get("produit", produitId);
                if (!produit) return this.afficherMessage("Produit introuvable.");


                // 1️⃣ STOCK TOTAL pour ce produit (somme)
                const stockTotal = stocks
                    .filter(s => s.produit == produitId)
                    .reduce((a, b) => a + Number(b.quantite), 0);

                // 2️⃣ QUANTITÉS ENGAGÉES dans TOUS LES PANIERS
                const engage = paniers.reduce((total, panier) => {
                    const qteDansPanier = (panier.items || [])
                        .filter(item => item.produit == produitId)
                        .reduce((somme, item) => somme + Number(item.quantite), 0);
                    return total + qteDansPanier;
                }, 0);

                // 3️⃣ DISPONIBLE = STOCK - ENGAGE

                const dispo = stockTotal - engage;
                if (q > dispo) {
                    this.afficherMessage(`Stock insuffisant ! Disponible : ${dispo}`);
                    return;
                }

                panier.items = panier.items || [];

                let existing = panier.items.find(it => it.produit == produitId);

                if (existing) {
                    // augmenter quantité
                    existing.quantite += q;
                } else {
                    // sinon, nouvel item
                    panier.items.push({
                        id: Date.now() + Math.random(),
                        produit: produitId,
                        designation: produit.designation,
                        prix: produit.pu,
                        quantite: q,
                        createdAt: new Date().toLocaleString("sv-SE").replace(" ", "T")
                    });
                }


                await this._recomputePanier(panier);
                // 🔄 Mise à jour immédiate du badge dans la carte
                const card = btn.closest('.card');
                const badge = card.querySelector('.badge');

                // retrouver le produit dans le panier après ajout / update
                let updatedItem = panier.items.find(it => it.produit == produitId);

                if (updatedItem) {
                    badge.textContent = `Added ${updatedItem.quantite}`;
                }

                this.renderPanierView(panier);
            };
        });

        // après avoir généré les cartes...
        const searchInput = document.getElementById("globalSearch");
        if (searchInput) {
            searchInput.value = ""; // reset
            searchInput.placeholder = "Filtrer les produits...";
            searchInput.oninput = () => {
                const term = searchInput.value.toLowerCase();
                produits.forEach(p => {
                    const card = document.querySelector(`.btn-add-product[data-id='${p.id}']`).closest('.card');
                    if (!card) return;
                    if (p.designation.toLowerCase().includes(term)) {
                        card.style.display = "block";
                    } else {
                        card.style.display = "none";
                    }
                });
            };
        }


        // bouton retour
        const backBtn = document.getElementById("backToPanier");
        if (backBtn) backBtn.onclick = () => this.renderPanierView(panier);
    }

    async _recomputePanier(panier) {
        panier.total = panier.items.reduce((s, i) => s + (i.quantite * i.prix), 0);
        panier.reste = panier.total - (panier.paye || 0);
        await this.db.put("panier", panier);
    }

    async renderHistoriquePaiements(panierId) {
        await this.syncPaiementsPanier(panierId);

        const paiements = await this.db.getAll("paiements");
        const list = paiements.filter(p => String(p.panier) === String(panierId));

        let html = `<h2>Historique des paiements du panier #${panierId}</h2>`;

        if (list.length === 0) {
            html += `<p>Aucun paiement trouvé.</p>`;
            html += `<button class="btn" id="retourPanier">⬅ Retour au panier</button>`;
            this.content.innerHTML = html;

            document.getElementById("retourPanier").onclick = async () => {
                const panier = await this.db.get("panier", panierId);
                this.renderPanierView(panier);
            };
            return;
        }


        html += `<div class="table">
                <div class="row header">
                    <div>Montant</div>
                    <div>Par</div>
                    <div>Dete</div>
                    <div>Action</div>
                </div>`;

        list.forEach(p => {
            let at = this.formatDateFR(p.createdAt);
            html += `
            <div class="row">
                    <div><b>${p.montant} HTG</b></div>
                    <div class="meta">${p.par || "?"}</div>
                    <div class="meta">${at}</div>
                <div><button class="btn-cancel-pay" title="Supprimer" data-id="${p.id}">⛔</button></div>
            </div>
        `;
        });

        html += `</div>`;
        html += `<button class="btn" id="retourPanier">⬅ Retour au panier</button>`;

        this.content.innerHTML = html;

        // retour panier
        document.getElementById("retourPanier").onclick = async () => {
            const panier = await this.db.get("panier", panierId);
            this.renderPanierView(panier);
        };

        // annulation paiement
        this.content.querySelectorAll(".btn-cancel-pay").forEach(btn => {
            btn.onclick = async () => {
                const payId = btn.dataset.id;
                if (!confirm("Voulez-vous vraiment annuler ce paiement ?")) return;

                // 1. récupérer le paiement
                const pay = await this.db.get("paiements", payId);
                if (!pay) return this.afficherMessage("Paiement introuvable !");

                // 🔥 Empêcher annulation si la date n'est pas aujourd'hui
                const datePaiement = new Date(pay.createdAt);
                const today = new Date();

                const sameDay =
                    datePaiement.getFullYear() === today.getFullYear() &&
                    datePaiement.getMonth() === today.getMonth() &&
                    datePaiement.getDate() === today.getDate();

                if (!sameDay) {
                    return this.afficherMessage("Impossible d'annuler : ce paiement n'a pas été effectué aujourd'hui !");
                }

                // 2. supprimer paiement
                await this.db.delete("paiements", payId);

                // 3. mettre à jour panier
                const panier = await this.db.get("panier", panierId);
                if (panier) {
                    panier.paye -= Number(pay.montant || 0);
                    panier.reste = panier.total - panier.paye;
                    if (panier.paye < 0) panier.paye = 0;
                    if (panier.reste < 0) panier.reste = panier.total;
                    await this.db.put("panier", panier);
                }

                this.afficherMessage("Paiement annulé !");
                this.renderHistoriquePaiements(panierId);
            };
        });


    }

    async syncPaiementsPanier(panierId) {
        // 1. récupérer tous les paiements de ce panier
        const allPays = await this.db.getAll("paiements");
        const paiements = allPays.filter(p => String(p.panier) === String(panierId));

        // 2. calculer total payé
        const totalPaye = paiements.reduce((sum, p) => sum + Number(p.montant || 0), 0);

        // 3. mettre à jour le panier
        const panier = await this.db.get("panier", panierId);
        if (panier) {
            panier.paye = totalPaye;
            panier.reste = panier.total - panier.paye;

            if (panier.reste < 0) panier.reste = 0;

            await this.db.put("panier", panier);
        }
    }


    toggleSearchBar(section) {
        const search = document.getElementById("globalSearch");
        const searchIcon = document.querySelector('search .icon');

        if (!search) return;

        if (section === "client" || section === "produit") {
            search.style.display = "block";
            search.placeholder = `Rechercher ${section}`;
            search.value = ""; // reset à chaque section
            searchIcon.style.display = "";
        } else {
            search.style.display = "none";
            searchIcon.style.display = "none"; // pour cacher
        }
    }

    async renderListe(mode = "commande", filter = "all", page = 1) {

        const paniers = await this.db.getAll("panier");

        // ======== Construction des items ========
        let items = [];

        if (mode === "commande") {
            // Les commandes = paniers ayant un total
            items = paniers.filter(p => p.total > 0).map(p => ({
                ...p,
                dateRef: p.createdAt   // <-- UNE SEULE DATE
            }));

        } else if (mode === "livraison") {

            items = [];

            paniers.forEach(p => {
                (p.items || []).forEach(i => {
                    if (i.delivered) {
                        items.push({
                            ...i,
                            panierId: p.id,
                            clientId: p.client,
                            dateRef: i.deliveredAt || Date.now()  // <-- UNE SEULE DATE
                        });
                    }
                });
            });
        }

        // ======== Préparation filtrage dates ========
        const now = new Date();
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startYesterday = startToday - 86400000;
        const startWeek = startToday - (now.getDay() === 0 ? 6 : now.getDay() - 1) * 86400000;
        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        const endLastMonth = startMonth - 1;

        let filtered = items;

        // ======== Filtrage ========
        if (filter !== "all") {

            filtered = items.filter(it => {
                const t = parseDate(it.dateRef);

                switch (filter) {
                    case "today": return t >= startToday;
                    case "yesterday": return t >= startYesterday && t < startToday;
                    case "week": return t >= startWeek;
                    case "month": {
                        const d = new Date(t);
                        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                    }
                    case "lastmonth": return t >= startLastMonth && t <= endLastMonth;
                }
            });
        }

        // ======== Pagination ========
        const perPage = 10;
        const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
        page = Math.min(page, totalPages);

        const pageItems = filtered.slice((page - 1) * perPage, page * perPage);

        // ======== Rendu HTML ========
        let html = `
        <div class="title-bar">
        <h2>${mode === "commande" ? "Commandes" : "Livraisons"}</h2>

        <div class="filter-bar">
            <select id="${mode}Filter">
                <option value="today" ${filter === "today" ? "selected" : ""}>Aujourd’hui</option>
                <option value="yesterday" ${filter === "yesterday" ? "selected" : ""}>Hier</option>
                <option value="week" ${filter === "week" ? "selected" : ""}>Cette semaine</option>
                <option value="month" ${filter === "month" ? "selected" : ""}>Ce mois</option>
                <option value="lastmonth" ${filter === "lastmonth" ? "selected" : ""}>Mois dernier</option>
                <option value="all" ${filter === "all" ? "selected" : ""}>Tous</option>
            </select>
        </div>
    </div>
    `;

        html += `<div class="list">`;

        if (pageItems.length === 0) {
            html += `<p class="small">Aucun résultat trouvé.</p>`;
        } else {

            html += `<div class="table">`;

            const fields = Object.keys(pageItems[0]).filter(f => !["id", "dateRef", "items", "client", "produit", "delivered", "panierId", "clientId"].includes(f));

            html += `<div class="row header">${fields.map(f => `<div>${f}</div>`).join('')}</div>`;

            let footerTable = { total: 0, paye: 0, reste: 0 };

            // Génération des lignes
            pageItems.forEach(it => {
                html += `<div class="row">${fields.map(f => {
                    let val = it[f];

                    // Formatage de la date
                    if ((f === "createdAt" || f === "deliveredAt") && val) {
                        val = this.formatDateFR(val);
                    }

                    // Somme des colonnes total, paye, reste
                    if (["total", "paye", "reste"].includes(f) && typeof val === 'number') {
                        footerTable[f] += val;
                    }

                    return `<div>${val}</div>`;
                }).join('')}</div>`;
            });

            // Génération de la ligne footer
            html += `<div class="row footer">` +
                fields.map(f => {
                    if (["total", "paye", "reste"].includes(f)) {
                        return `<div>${footerTable[f]}</div>`;
                    }
                    return `<div></div>`; // vide pour les autres colonnes
                }).join('') +
                `</div>`;

            // Maintenant tu peux insérer html dans ton conteneur
            // document.querySelector('#tableContainer').innerHTML = html;

            // -----------------------------------------------

        }

        // Pagination
        html += `</div>
        <div class="pagination">
            <button id="${mode}Prev" ${page <= 1 ? "disabled" : ""}>◀</button>
            Page ${page} / ${totalPages}
            <button id="${mode}Next" ${page >= totalPages ? "disabled" : ""}>▶</button>
        </div>
    `;

        this.content.innerHTML = html;

        // ======== Events ========
        document.getElementById(`${mode}Filter`).onchange = e =>
            this.renderListe(mode, e.target.value, 1);

        document.getElementById(`${mode}Prev`).onclick = () =>
            page > 1 && this.renderListe(mode, filter, page - 1);

        document.getElementById(`${mode}Next`).onclick = () =>
            page < totalPages && this.renderListe(mode, filter, page + 1);

        // Commandes → bouton ouvrir
        if (mode === "commande") {
            this.content.querySelectorAll(".btn-open").forEach(btn => {
                btn.onclick = () => this.openCommande(btn.dataset.id);
            });
        }

        // Livraison → checkbox
        if (mode === "livraison") {
            this.content.querySelectorAll(".chk-delivery").forEach(chk => {
                chk.onchange = async () => {
                    const itemId = chk.dataset.id;
                    const panier = paniers.find(p => (p.items || []).some(i => i.id == itemId));
                    if (!panier) return;

                    const it = panier.items.find(i => i.id === itemId);
                    if (!it) return;

                    it.delivered = chk.checked;
                    it.deliveredAt = chk.checked ? Date.now() : null;

                    await this.db.put("panier", panier);

                    this.renderListe("livraison", filter, page);
                };
            });
        }
    }

    async renderProfitChart(anneeChoisie = null) {
        // let annee = prompt("selectionner annee");
        // if (annee != null) {
        //     anneeChoisie = annee;
        // }


        let depenses = await this.getDepenseParMois();
        let ventes = await this.getVenteParAnnee();
        const rapport = this.calculerProfits(depenses, ventes, anneeChoisie);
        const profits = rapport.profits
        console.log(depenses);

        // this.afficherMessage("selectionner annee")

        this.content.innerHTML = `
    <div class="profit-container">
        <div class="profit" id="profit">
            <div class="axes-y"></div>
            <div class="axes-x"></div>
        </div>
    </div>
    `
        // ----------------------------------------------------------------
        const sel = document.getElementById("select-annee");
        const annees = Object.keys(depenses);
        const currentYear = new Date().getFullYear().toString();
        sel.innerHTML = "";
        annees.forEach(annee => {
            const opt = document.createElement("option");
            opt.value = annee;
            opt.textContent = annee;
            if (annee === currentYear) {
                opt.selected = true;
            }
            sel.appendChild(opt);
        });
        // -----------------------------------------------------------------
        const profit = document.getElementById("profit");
        const w = profit.clientWidth - 80; // padding + axe Y
        const h = profit.clientHeight - 60; // padding + axe X
        const maxProfit = Math.max(...profits.map(p => p.profit));
        const minProfit = Math.min(...profits.map(p => p.profit));

        // Grille horizontale
        const hLines = 5;
        for (let i = 0; i <= hLines; i++) {
            const y = (h / hLines) * i;

            const line = document.createElement("div");
            line.className = "grid-line grid-horizontal";
            line.style.top = (20 + y) + "px";
            profit.appendChild(line);

            const label = document.createElement("div");
            label.className = "label-y";
            label.style.top = (20 + y) + "px";
            const val = Math.round(maxProfit - ((maxProfit - minProfit) / h * y));
            label.innerText = val;
            profit.appendChild(label);
        }

        // Grille verticale
        const vLines = profits.length - 1;
        for (let i = 0; i <= vLines; i++) {
            const x = (w / vLines) * i;

            const line = document.createElement("div");
            line.className = "grid-line grid-vertical";
            line.style.left = (60 + x) + "px";
            profit.appendChild(line);

            const label = document.createElement("div");
            label.className = "label-x";
            label.style.left = (60 + x) + "px";
            label.innerText = profits[i].mois;
            profit.appendChild(label);
        }

        // Points
        const points = profits.map((p, i) => {
            const x = 60 + (w / (profits.length - 1)) * i;
            const y = 20 + h - ((p.profit - minProfit) / (maxProfit - minProfit)) * h;

            const dot = document.createElement("div");
            dot.className = "point";
            dot.style.left = x + "px";
            dot.style.top = y + "px";
            dot.setAttribute("data-tooltip", `${p.mois}: ${p.profit} HTG`);
            profit.appendChild(dot);

            return { x, y };
        });

        // Ligne (segments)
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];

            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            const segment = document.createElement("div");
            segment.className = "line-segment";
            segment.style.width = length + "px";
            segment.style.left = p1.x + "px";
            segment.style.top = p1.y + "px";
            segment.style.transform = `rotate(${angle}deg)`;
            profit.appendChild(segment);
        }
    }

    async openHome() {
        const paniers = await this.db.getAll("panier");
        const paiements = await this.db.getAll("paiements");

        const dashboard = new Dashboard(document.getElementById('content'));

        // Calcul initial
        const data = dashboard.calculateStatsPeriods(paniers, paiements);
        dashboard.renderHomeChart(data);
    }


    formatDateFR(isoString) {
        const d = new Date(isoString);
        const pad = n => n.toString().padStart(2, '0');

        const day = pad(d.getDate());
        const month = pad(d.getMonth() + 1); // Mois commence à 0
        const year = d.getFullYear();

        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        const seconds = pad(d.getSeconds());

        return `${day}-${month}-${year} à ${hours}:${minutes}:${seconds}`;
    }

    formatMonetaire(n) {
        return Number(n).toLocaleString("fr-FR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + " HTG";
    }

    // -------------------------------------------------------------
    // 🔥 Méthode pour calculer les dépenses par année et par mois
    async getDepenseParMois() {
        const stock = await this.db.getAll("stock");
        const result = {};

        const mois = ["jan", "fev", "mar", "avr", "mai", "jun", "jul", "aou", "sep", "oct", "nov", "dec"];

        stock.forEach(item => {
            if (!item.createdAt || !item.quantite || !item.prix) return; // Ignore données invalides

            const d = new Date(item.createdAt);
            if (isNaN(d)) return; // Ignore dates invalides

            const annee = d.getFullYear();
            const nomMois = mois[d.getMonth()];
            const depense = item.quantite * item.prix;

            if (!result[annee]) result[annee] = {};       // Crée l'objet année si nécessaire
            result[annee][nomMois] = (result[annee][nomMois] || 0) + depense;
        });

        return result;
    }

    async getVenteParAnnee() {
        const panier = await this.db.getAll("panier");

        // base des mois
        const base = {
            jan: 0, fev: 0, mar: 0, avr: 0, mai: 0, jun: 0,
            jul: 0, aou: 0, sep: 0, oct: 0, nov: 0, dec: 0
        };

        const moisKeys = ["jan", "fev", "mar", "avr", "mai", "jun",
            "jul", "aou", "sep", "oct", "nov", "dec"];

        const result = {};

        panier.forEach(p => {
            const d = new Date(p.createdAt);
            const year = d.getFullYear();           // ← année
            const monthIndex = d.getMonth();        // 0 à 11
            const key = moisKeys[monthIndex];

            // Initialise l’année si nécessaire
            if (!result[year]) {
                result[year] = { ...base };
            }

            // Ajoute le total de la vente
            result[year][key] += Number(p.total || 0);
        });

        return result;
    }


    calculerProfits(achatParAnnee, venteParAnnee, anneeChoisie = null) {
        const ordre = ["jan", "fev", "mar", "avr", "mai", "jun", "jul", "aou", "sep", "oct", "nov", "dec"];
        const noms = {
            jan: "Jan", fev: "Fév", mar: "Mar", avr: "Avr", mai: "Mai",
            jun: "Juin", jul: "Juil", aou: "Aoû", sep: "Sep",
            oct: "Oct", nov: "Nov", dec: "Déc"
        };

        // Déterminer l'année à utiliser
        const annee = anneeChoisie || new Date().getFullYear().toString();

        const vente = venteParAnnee[annee] || {};
        const achat = achatParAnnee[annee] || {};

        // Calcul du profit par mois
        const profitsObj = {};
        for (const mois of ordre) {
            const v = vente[mois] || 0;
            const a = achat[mois] || 0;
            profitsObj[mois] = v - a;
        }

        // Transformation en tableau trié
        const profits = ordre.map(mois => ({
            mois: noms[mois],
            profit: profitsObj[mois]
        }));
        // Calcul total annuel
        const totalAnnuel = Object.values(profitsObj).reduce((sum, val) => sum + val, 0);

        return {
            annee,
            profits,
            totalAnnuel
        };
    }

    afficherMessage(texte, duree = 3000) {
        const box = document.getElementById("message-box");
        if (!box) return;
        box.textContent = texte;
        box.style.display = "block";       // 👈 Assure qu'elle est visible
        box.style.opacity = 1;
        clearTimeout(box._timeout);
        box._timeout = setTimeout(() => {
            box.style.display = "none";    // 👈 Cache après fondu
            box.style.opacity = 0;
        }, duree);
    }


}

class Dashboard {
    constructor(content) {
        this.content = content;
        this.latestData = null; // données calculées pour réutilisation
    }


    // ✅ Calcul des stats avec gestion correcte des dates
    calculateStatsPeriods(paniers, paiements) {
        const now = new Date();
        const todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate();

        // Début et fin de semaine (lundi-dimanche)
        const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay();
        const startWeek = new Date(todayY, todayM, todayD - (dayOfWeek - 1));
        const endWeek = new Date(startWeek);
        endWeek.setDate(startWeek.getDate() + 6);
        endWeek.setHours(23, 59, 59, 999);

        // Mois actuel
        const startMonth = new Date(todayY, todayM, 1);
        const endMonth = new Date(todayY, todayM + 1, 0, 23, 59, 59, 999);

        // Mois dernier
        const startLastMonth = new Date(todayY, todayM - 1, 1);
        const endLastMonth = new Date(todayY, todayM, 0, 23, 59, 59, 999);


        const periods = {
            today: { vente: 0, reste: 0, paye: 0 },
            week: { vente: 0, reste: 0, paye: 0 },
            month: { vente: 0, reste: 0, paye: 0 },
            lastmonth: { vente: 0, reste: 0, paye: 0 },
            all: { vente: 0, reste: 0, paye: 0 }
        };

        // Fonction utilitaire pour additionner
        const add = (target, p) => {
            target.vente += p.total || 0;
            target.reste += (p.total || 0) - (p.paye || 0);
        };

        const addPaiement = (target, p) => {
            target.paye += p.montant || 0;
        };

        // Parcours des paniers
        paniers.forEach(p => {
            const d = new Date(p.createdAt);
            add(periods.all, p);
            if (d.getFullYear() === todayY && d.getMonth() === todayM && d.getDate() === todayD) add(periods.today, p);
            if (d >= startWeek && d <= endWeek) add(periods.week, p);
            if (d >= startMonth && d <= endMonth) add(periods.month, p);
            if (d >= startLastMonth && d <= endLastMonth) add(periods.lastmonth, p);
        });

        // Parcours des paiements
        paiements.forEach(p => {
            const d = new Date(p.createdAt);
            addPaiement(periods.all, p);
            if (d.getFullYear() === todayY && d.getMonth() === todayM && d.getDate() === todayD) addPaiement(periods.today, p);
            if (d >= startWeek && d <= endWeek) addPaiement(periods.week, p);
            if (d >= startMonth && d <= endMonth) addPaiement(periods.month, p);
            if (d >= startLastMonth && d <= endLastMonth) addPaiement(periods.lastmonth, p);
        });

        this.latestData = periods;
        return periods;
    }


    // ✅ Rendu initial du graphique
    renderHomeChart(data) {
        this.content.innerHTML = `
            <h2>Statistiques périodiques</h2>
            <div class="chart-zone">
                <div class="y-axis" id="yAxis"></div>
                <div class="chart-container" id="chart"></div>
            </div>

            <div class="legend">
                <div><span class="l1" style="background:#2196F3"></span> Vente</div>
                <div><span class="l2" style="background:#4CAF50"></span> Payé</div>
                <div><span class="l3" style="background:#FFC107"></span> Reste</div>
            </div>
        `;

        const chart = document.getElementById("chart");
        const yAxis = document.getElementById("yAxis");

        const dataArray = Object.keys(data)
            .filter(label => label !== "all")   // ⛔️ on élimine "all"
            .map(label => ({
                label,
                values: [data[label].vente, data[label].paye, data[label].reste]
            }));

        const flat = dataArray.flatMap(d => d.values);
        const maxValue = Math.max(...flat, 1);
        const step = Math.pow(10, Math.floor(Math.log10(maxValue)));
        const scaleMax = Math.ceil(maxValue / step) * step;
        const steps = 6;

        // Y labels
        for (let i = steps; i >= 0; i--) {
            const lbl = document.createElement("div");
            lbl.textContent = Math.round((scaleMax / steps) * i).toLocaleString();
            yAxis.appendChild(lbl);
        }

        // Grid
        for (let i = 1; i <= steps; i++) {
            const line = document.createElement("div");
            line.className = "grid-line";
            line.style.bottom = `${(i / steps) * 100}%`;
            chart.appendChild(line);
        }

        // Bars
        dataArray.forEach(cat => {
            const group = document.createElement("div");
            group.className = "category";

            const bars = document.createElement("div");
            bars.className = "bars";
            bars.dataset.max = scaleMax;

            cat.values.forEach((v, i) => {
                const b = document.createElement("div");
                b.className = "bar b" + (i + 1);
                b.style.height = (v / scaleMax * 100) + "%";

                if (i === 0) b.style.backgroundColor = "#2196F3"; // Vente
                if (i === 1) b.style.backgroundColor = "#4CAF50"; // Payé
                if (i === 2) b.style.backgroundColor = "#FFC107"; // Reste

                bars.appendChild(b);
            });

            const label = document.createElement("div");
            label.className = "x-label";
            label.textContent = cat.label;

            group.appendChild(bars);
            group.appendChild(label);
            chart.appendChild(group);
        });
    }

}

// ==========================================================
//  CLASS : CONFIGURATION
// ==========================================================
class ConfigManager {
    constructor() {
        this.apiKey = localStorage.getItem("drive_api_key");
        this.fileId = localStorage.getItem("drive_file_id");
    }

    save(apiKey, fileId) {
        this.apiKey = apiKey;
        this.fileId = fileId;

        localStorage.setItem("drive_api_key", apiKey);
        localStorage.setItem("drive_file_id", fileId);
    }

    isReady() {
        return this.apiKey && this.fileId;
    }

    fillForm() {
        document.getElementById("cfg-api-key").value = this.apiKey || "";
        document.getElementById("cfg-file-id").value = this.fileId || "";
    }
}

// ==========================================================
//  CLASS : CHARGER XML
// ==========================================================
class XMLLoader {
    constructor(config) {
        this.config = config;
    }

    async load() {
        if (!this.config.isReady()) {
            showConfigPanel();
            return null;
        }

            const url =
            `https://www.googleapis.com/drive/v3/files/${this.config.fileId}?alt=media&key=${this.config.apiKey}`;

        try {
            const resp = await fetch(url);
            const xmlText = await resp.text();

            return new DOMParser().parseFromString(xmlText, "application/xml");

        } catch (err) {
            console.error("Erreur lors du chargement XML : " + err);
            // console.error(err);
        }
    }
}

// ==========================================================
//  CLASS : PARSEUR SMS
// ==========================================================
class SMSParser {
    static parse(smsNode) {

        const body = smsNode.getAttribute("body");
        const dateTS = parseInt(smsNode.getAttribute("date"));

        let montant, de, a;

        let match1 = body.match(/re.*u\s([\d,.]+)\sHTG\sde\s(.+?)\s+a\s([\d:\/ ]+)/i);
        let match2 = body.match(/encaisse\s([\d,.]+)\sHTG\s+a\s([\d:\/ ]+)\sde\s(.+)/i);

        if (match1) {
            montant = match1[1];
            de = match1[2].trim();
            a = match1[3].trim();
        }
        else if (match2) {
            montant = match2[1];
            a = match2[2].trim();
            de = match2[3].trim();
        }
        else return null;

        // Nettoyage 'de'
        const dotIndex = de.indexOf(".");
        if (dotIndex !== -1) de = de.substring(0, dotIndex).trim();

        let numero = null;
        let numMatch = de.match(/(\d{5,})/g);
        if (numMatch) numero = numMatch[numMatch.length - 1];

        if (numero) de = de.replace(numero, "").trim();

        de = de.replace(/\bcode\b/gi, "").trim();
        de = de.replace(/[, ]+/g, " ").trim();

        // Montant
        let montantNum = parseFloat(montant.replace(/,/g, ""));
        if (isNaN(montantNum)) return null;

        montant = montantNum;

        // Date
        let dateParts = a.match(/(\d{2}):(\d{2}) (\d{2})\/(\d{2})\/(\d{4})/);
        if (dateParts) {
            a = `${dateParts[5]}-${dateParts[4]}-${dateParts[3]} ${dateParts[1]}:${dateParts[2]}`;
        } else {
            const d = new Date(dateTS);
            a =
                d.getFullYear() + "-" +
                String(d.getMonth() + 1).padStart(2, "0") + "-" +
                String(d.getDate()).padStart(2, "0") + " " +
                String(d.getHours()).padStart(2, "0") + ":" +
                String(d.getMinutes()).padStart(2, "0");
        }

        let transMatch = body.match(/TransCode\s*[:\-]?\s*(\w+)/i);
        const TransCode = transMatch ? transMatch[1] : dateTS;

        return { id: TransCode, de, numero, a, montant, used: false };
    }
}

// ==========================================================
//  CLASS : TRANSACTIONS
// ==========================================================
class TransactionService {
    constructor() {
        this.db = new Database();
    }

    async init() {
        try {
            await this.db.init();
        } catch (err) {
            console.error("Erreur init DB:", err);
        }
    }

    add(txn) {
        return new Promise((resolve, reject) => {
            const store = this.db.getStore("readwrite");
            txn.used = false;
            const req = store.add(txn);

            req.onsuccess = () => resolve(true);
            req.onerror = event => {
                if (event.target.error.name === "ConstraintError") resolve(false);
                else reject(event.target.error);
            };
        });
    }

    get(code) {
        return new Promise((resolve, reject) => {
            const store = this.db.getStore();
            const req = store.get(code);

            req.onsuccess = () => resolve(req.result || null);
            req.onerror = reject;
        });
    }

    markUsed(code) {
        return new Promise((resolve, reject) => {
            const store = this.db.getStore("readwrite");
            const req = store.get(code);

            req.onsuccess = () => {
                let data = req.result;
                if (!data) return resolve(false);

                data.used = true;
                const r2 = store.put(data);

                r2.onsuccess = () => resolve(true);
                r2.onerror = reject;
            };
        });
    }
}

// ==========================================================
//  CLASS : NACASH
// ==========================================================
class NaCashService {
    constructor(transactionService) {
        this.ts = transactionService;
    }

    async validate(panierId, code) {
        const tx = await this.ts.get(code);
        if (!tx) return { ok: false, error: "Code NaCash invalide !" };

        if (tx.used) return { ok: false, error: "Ce code NaCash a déjà été utilisé !" };

        const montantPanier = await getMontantPanier(panierId);

        if (tx.montant < montantPanier)
            return { ok: false, error: "Montant insuffisant." };

        await this.ts.markUsed(code);
        await setPanierPaid(panierId, tx.montant, code);

        return { ok: true, data: tx };
    }
}

// ==================================================================================================
// Init
document.addEventListener("DOMContentLoaded", async () => {
    const config = new ConfigManager();
const xmlLoader = new XMLLoader(config);
let transactionService;
let naCashService;

    let obj = new Navigation();
    await obj.init();

    const settingBtn = document.getElementById("setting");
    const authBtn = document.getElementById("auth");

    // Clic sur l’icône réglages (⚙)
    settingBtn.addEventListener("click", (e) => {
        e.preventDefault();
        console.log("Réglages cliqués");
        // Ton code ici...
    });

    // Clic sur le bouton logout (🔒)
    authBtn.addEventListener("click", (e) => {
        e.preventDefault();
        console.log("Logout cliqué");
        // Ton code ici...
    });

    // ==================== MODAL ====================
    const modal = document.getElementById("modal-setting");
    const closeModal = document.getElementById("close-modal");
    const saveConfig = document.getElementById("save-config");

    // --- Ouvrir la modal ---
    settingBtn.addEventListener("click", (e) => {
        e.preventDefault();
        modal.style.display = "flex";
    });

    // --- Fermer modal ---
    closeModal.addEventListener("click", () => {
        modal.style.display = "none";
    });

    // Fermer si on clique en dehors de la fenêtre
    window.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
        }
    });


    // ==================== SAUVEGARDE LICENCE ====================
    saveConfig.addEventListener("click", () => {
 
    const apiKey = document.getElementById("cfg-api-key").value.trim();
    const fileId = document.getElementById("cfg-file-id").value.trim();

    if (!apiKey || !fileId) {
        alert("Champs incomplets !");
        return;
    }

    config.save(apiKey, fileId);
    xmlLoader.load();

        modal.style.display = "none";
    });

    // ==================== LOGOUT ====================
    authBtn.addEventListener("click", (e) => {
        e.preventDefault();

        // Supprimer les données utilisateur si tu en as
        localStorage.removeItem("user");

        // Redirection vers la page de login
        window.location.href = "login.html";
    });


    // ======================================rapport=====================================

    const radios = document.getElementsByName("report");
    const sel = document.getElementById("select-annee");

    // Fonction d'affichage
    async function showSelectedMessage() {
        const selected = Array.from(radios).find(r => r.checked);
        const id = selected.closest(".report").dataset.id;
        // output.textContent = messages[id];
        if (id === "stats") {
            await obj.openHome();
            return;
        }
        if (id === "commandes") {
            await obj.renderListe("commande", "all", 1);
            return;
        }

        if (id === "livraison") {
            await obj.renderListe("livraison", "all", 1);
            return;
        }
        if (id === "profits") {
            await obj.renderProfitChart();
            sel.hidden = false;
            return;
        }


    }

    // Changement dynamique
    radios.forEach(radio => {
        // radio.addEventListener("change", showSelectedMessage);
        radio.addEventListener("click", showSelectedMessage);
    });


    sel.addEventListener("change", (e) => {
        obj.renderProfitChart(e.target.value);
        sel.hidden = true;
    });

    await obj.openHome();
    sel.hidden = true;


    transactionService = new TransactionService();
    transactionService.init();
    naCashService = new NaCashService(transactionService);

    const xmlDoc = await xmlLoader.load();
    if (!xmlDoc) return;

    const smsNodes = xmlDoc.getElementsByTagName("sms");
    for (let sms of smsNodes) {
        const txn = SMSParser.parse(sms);
        if (txn) await transactionService.add(txn);
    }

});


