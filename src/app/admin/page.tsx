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
    <div className="max-w-2xl mx-auto p-8" onClick={() => setDeleteConfirm(null)}>
      <h1 className="text-4xl mb-8">Admin Panel</h1>

      {/* Users section */}
      <h2 className="text-2xl mb-4">Users</h2>
      {users.length === 0 ? (
        <p>No users found.</p>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-3 bg-gray-100 rounded-lg"
            >
              <div>
                <span>{user.name}</span>
                <span className="text-sm text-gray-500 ml-2">{user.moxfieldCollectionId}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(user.id);
                }}
                className={
                  deleteConfirm === user.id
                    ? "px-3 py-1 bg-red-700 text-white rounded cursor-pointer"
                    : "px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 cursor-pointer"
                }
              >
                {deleteConfirm === user.id ? "Are you sure?" : "Delete"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add User form */}
      <h2 className="text-2xl mb-4 mt-8">Add User</h2>
      <form onSubmit={handleAddUser} className="space-y-3">
        <input
          type="text"
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          placeholder="Name"
          required
          className="block w-full px-4 py-2 border rounded-lg"
        />
        <input
          type="text"
          value={addCollectionId}
          onChange={(e) => setAddCollectionId(e.target.value)}
          placeholder="Moxfield Collection ID"
          required
          className="block w-full px-4 py-2 border rounded-lg"
        />
        <button
          type="submit"
          disabled={isAdding || !addName.trim() || !addCollectionId.trim()}
          className="px-6 py-3 bg-accent1 text-background rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isAdding ? "Adding..." : "Add User"}
        </button>
      </form>

      {/* User operation feedback */}
      {userMessage && (
        <p className={`mt-4 ${userMessage.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
          {userMessage}
        </p>
      )}

      <hr className="my-8" />

      {/* Existing Update All Collections section */}
      <div className="space-y-4">
        <button
          onClick={handleUpdate}
          disabled={isUpdating}
          className="px-6 py-3 bg-accent1 text-background rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isUpdating ? "Updating..." : "Update All Collections"}
        </button>
      </div>

      {message && (
        <p className={`mt-4 ${message.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
