"use client";

import { useState, useEffect } from "react";

export default function AdminPage() {
  // Existing state for Update All Collections
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState("");

  // User management state
  const [users, setUsers] = useState<Array<{ id: string; name: string; moxfieldCollectionId: string }>>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addCollectionId, setAddCollectionId] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
  }

  async function handleDelete(userId: string) {
    if (deleteConfirm !== userId) {
      setDeleteConfirm(userId);
      return;
    }
    // Second click — fire delete
    setDeleteConfirm(null);
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    if (res.ok) {
      setUserMessage("User deleted successfully!");
      fetchUsers();
    } else {
      const data = await res.json();
      setUserMessage(`Error: ${data.error}`);
    }
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setIsAdding(true);
    setUserMessage("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addName, moxfieldCollectionId: addCollectionId }),
      });
      const data = await res.json();
      if (res.ok) {
        setUserMessage("User added successfully!");
        setAddName("");
        setAddCollectionId("");
        fetchUsers();
      } else {
        setUserMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setUserMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsAdding(false);
    }
  }

  const handleUpdate = async () => {
    setIsUpdating(true);
    setMessage("Updating collections...");

    try {
      const response = await fetch("/api/admin/updateCollections", {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        setMessage("Collections updated successfully!");
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8" onClick={() => setDeleteConfirm(null)}>
      <h1 className="text-3xl mb-8">Admin Panel</h1>

      {/* Users section */}
      <div className="rounded-lg border border-border bg-surface p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Users</h2>
        {users.length === 0 ? (
          <p className="text-muted text-sm">No users found.</p>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg bg-background border border-border"
              >
                <div className="min-w-0">
                  <span className="font-medium">{user.name}</span>
                  <span className="text-sm text-muted ml-2 font-mono">{user.moxfieldCollectionId}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(user.id);
                  }}
                  className={`ml-3 flex-shrink-0 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
                    deleteConfirm === user.id
                      ? "bg-destructive text-white"
                      : "bg-destructive/10 text-red-400 hover:bg-destructive/20"
                  }`}
                >
                  {deleteConfirm === user.id ? "Confirm?" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add User form */}
      <div className="rounded-lg border border-border bg-surface p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Add User</h2>
        <form onSubmit={handleAddUser} className="space-y-3">
          <input
            type="text"
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Name"
            required
            className="block w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
          />
          <input
            type="text"
            value={addCollectionId}
            onChange={(e) => setAddCollectionId(e.target.value)}
            placeholder="Moxfield Collection ID"
            required
            className="block w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors"
          />
          <button
            type="submit"
            disabled={isAdding || !addName.trim() || !addCollectionId.trim()}
            className="px-5 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isAdding ? "Adding..." : "Add User"}
          </button>
        </form>

        {userMessage && (
          <p className={`mt-4 text-sm font-medium ${userMessage.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
            {userMessage}
          </p>
        )}
      </div>

      {/* Update All Collections section */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold mb-4">Sync Collections</h2>
        <p className="text-sm text-muted mb-4">Re-scrape all Moxfield collections and update the database.</p>
        <button
          onClick={handleUpdate}
          disabled={isUpdating}
          className="px-5 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isUpdating ? "Updating..." : "Update All Collections"}
        </button>

        {message && (
          <p className={`mt-4 text-sm font-medium ${message.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
