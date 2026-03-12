// Frontend logic interacting with Backend APIs

// --- Authentication --- //

async function registerUser(event) {
    event.preventDefault();
    const name = document.getElementById("regName").value;
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;

    try {
        const response = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert("Registration successful! Please login.");
            window.location.href = "login.html";
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to connect to server");
    }
}

async function loginUser(event) {
    event.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    try {
        const response = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Save user data to local storage to simulate session mapping
            localStorage.setItem("user", JSON.stringify({ name: data.name, email: data.email, token: data.token }));
            alert(`Welcome back, ${data.name}!`);
            window.location.href = "index.html";
        } else {
            alert("Login Failed: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to connect to server");
    }
}

function logoutUser() {
    localStorage.removeItem("user");
    alert("Logged out successfully");
    window.location.reload();
}

// --- Item Reporting --- //

async function saveItem(event, type) {
    event.preventDefault();
    
    // Retrieve logged-in user if available
    const user = JSON.parse(localStorage.getItem("user"));
    const token = user ? user.token : null;

    if (!token) {
        alert("You must be logged in to report an item.");
        window.location.href = "login.html";
        return;
    }

    const itemName = document.getElementById("itemName").value;
    const description = document.getElementById("description").value;
    const location = document.getElementById("location").value;
    const date = document.getElementById("date").value;
    const imageInput = document.getElementById("image");

    const formData = new FormData();
    formData.append("type", type);
    formData.append("itemName", itemName);
    formData.append("description", description);
    formData.append("location", location);
    formData.append("date", date);
    
    if (imageInput && imageInput.files[0]) {
        formData.append("image", imageInput.files[0]);
    }

    try {
        const response = await fetch("/api/items", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`
            },
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            alert(`${type === 'lost' ? 'Lost' : 'Found'} item reported successfully!`);
            window.location.href = "search.html";
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to connect to server");
    }
}

// --- Search functionality --- //

async function loadItems() {
    const searchForm = document.getElementById("searchForm");
    const searchInput = document.getElementById("searchInput") ? document.getElementById("searchInput").value : '';
    const locInput = document.getElementById("locInput") ? document.getElementById("locInput").value : '';
    
    // Construct query parameters
    const params = new URLSearchParams();
    if (searchInput) params.append("search", searchInput);
    if (locInput) params.append("location", locInput);

    try {
        const response = await fetch(`/api/items?${params.toString()}`);
        const items = await response.json();
        
        const tbody = document.getElementById("resultsTableBody");
        if (!tbody) return; // Do nothing if on a different page.

        tbody.innerHTML = ""; // Clear current rows

        if (items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center">No items found matching your criteria.</td></tr>`;
            return;
        }

        items.forEach(item => {
            const icon = item.type === 'lost' ? '<i class="fa-solid fa-triangle-exclamation text-danger me-2"></i>' : '<i class="fa-solid fa-hand-holding-heart text-info me-2"></i>';
            const badgeClass = item.type === 'lost' ? 'status-lost' : 'status-found';
            const badgeText = item.status.charAt(0).toUpperCase() + item.status.slice(1);
            
            // Format date nicely
            const dateObj = new Date(item.date);
            const dateStr = !isNaN(dateObj) ? dateObj.toLocaleDateString() : item.date;
            
            // Image handling (add an img tag if image_url exists)
            const imgHtml = item.image_url ? `<br><img src="${item.image_url}" alt="Item Image" style="max-width: 100px; max-height: 100px; margin-top: 10px; border-radius: 5px;">` : '';

            // Check if current user owns the item to show delete/resolve buttons
            const currentUser = JSON.parse(localStorage.getItem("user"));
            const currentUserEmail = currentUser ? currentUser.email : null;
            const isOwner = currentUserEmail === item.user_email;

            // Action buttons HTML
            let actionHtml = '';
            if (isOwner) {
                actionHtml = `
                    <button onclick="deleteItem(${item.id})" class="btn btn-sm btn-danger py-1 px-3 m-0 mb-1 d-block w-100">Delete</button>
                    <button onclick="updateItemStatus(${item.id}, 'resolved')" class="btn btn-sm btn-success py-1 px-3 m-0 d-block w-100">Resolve</button>
                `;
            } else {
                actionHtml = `<button onclick="openMessageModal('${item.user_email}', ${item.id}, '${item.itemName.replace(/'/g, "\\'")}')" class="btn btn-sm btn-glass py-1 px-3 m-0">Contact</button>`;
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${icon} <strong>${item.itemName}</strong> <br><small class="text-muted d-block mt-1">${dateStr}</small>${imgHtml}</td>
                <td>${item.description}</td>
                <td>${item.location}</td>
                <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
                <td class="text-center">${actionHtml}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error("Failed to load items", err);
    }
}

// --- Item Management Actions --- //

async function deleteItem(id) {
    if (!confirm("Are you sure you want to delete this item?")) return;

    const user = JSON.parse(localStorage.getItem("user"));
    const token = user ? user.token : null;

    if (!token) {
        alert("You must be logged in.");
        return;
    }

    try {
        const response = await fetch(`/api/items/${id}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (response.ok) {
            alert("Item deleted successfully!");
            loadItems(); // Refresh the list
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to connect to server");
    }
}

async function updateItemStatus(id, status) {
    const user = JSON.parse(localStorage.getItem("user"));
    const token = user ? user.token : null;

    if (!token) {
        alert("You must be logged in.");
        return;
    }

    try {
        const response = await fetch(`/api/items/${id}`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status })
        });

        const data = await response.json();
        if (response.ok) {
            alert("Item status updated!");
            loadItems(); // Refresh the list
        } else {
            alert("Error: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to connect to server");
    }
}

// --- Messaging System --- //

function openMessageModal(receiverEmail, itemId, itemName) {
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user) {
        alert("You must be logged in to send a message.");
        window.location.href = "login.html";
        return;
    }
    
    const message = prompt(`Send a message regarding '${itemName}':`);
    if (message) {
        sendMessage(receiverEmail, itemId, message);
    }
}

async function sendMessage(receiverEmail, itemId, message) {
    const user = JSON.parse(localStorage.getItem("user"));
    const token = user ? user.token : null;

    try {
        const response = await fetch("/api/messages", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ receiver_email: receiverEmail, item_id: itemId, message: message })
        });

        const data = await response.json();
        if (response.ok) {
            alert("Message sent successfully!");
        } else {
            alert("Failed to send message: " + data.error);
        }
    } catch (err) {
        console.error(err);
        alert("Failed to connect to server");
    }
}

async function viewMessages() {
    const user = JSON.parse(localStorage.getItem("user"));
    const token = user ? user.token : null;

    if (!token) {
        alert("Your session has expired or you are using an older login session. Please log out and back in to view your inbox.");
        return;
    }

    try {
        const response = await fetch("/api/messages", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                 alert("Your secure session has expired. Please log out and log back in.");
                 return;
            }
            throw new Error("Failed to fetch");
        }

        const messages = await response.json();
        let msgText = "--- Your Messages ---\n\n";
        if (messages.length === 0) {
            msgText += "You have no new messages.";
        } else {
            messages.forEach(m => {
                const date = new Date(m.created_at).toLocaleString();
                msgText += `[${date}] From ${m.sender_email} regarding '${m.itemName}':\n"${m.message}"\n\n`;
            });
        }
        alert(msgText);
    } catch (err) {
        console.error(err);
        alert("Failed to connect to server to fetch messages.");
    }
}

// Helper: Handle dynamic UI state (e.g. changing login to logout in nav)
document.addEventListener("DOMContentLoaded", () => {
    
    const user = JSON.parse(localStorage.getItem("user"));
    const authDiv = document.getElementById("authDiv");

    if (user && authDiv) {
        // If logged in, show username and logout button instead of register/login links
        authDiv.innerHTML = `
            <span class="text-white me-3 align-self-center"><i class="fa-solid fa-user me-1 text-secondary"></i> ${user.name}</span>
            <button onclick="viewMessages()" class="btn btn-warning btn-sm m-0 me-2"><i class="fa-solid fa-envelope"></i> Inbox</button>
            <button onclick="logoutUser()" class="btn btn-glass btn-sm m-0">Logout</button>
        `;
    }

    // Attach search form event listener if search page
    const searchForm = document.getElementById("searchForm");
    if (searchForm) {
        searchForm.addEventListener("submit", (e) => {
            e.preventDefault();
            loadItems();
        });
        
        // Load items initially on search page load
        loadItems();
    }
});