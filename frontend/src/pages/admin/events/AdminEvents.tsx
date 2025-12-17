import { useState } from "react";

const AdminEvents: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  // Mock events data
  const [events] = useState([
    { id: 1, title: "Annual Conference", date: "2026-01-15", attendees: 120 },
    { id: 2, title: "Team Workshop", date: "2025-12-20", attendees: 45 },
  ]);

  return (
    <div className="admin-view-page">
      <div className="view-header">
        <h2>Events Management</h2>
        <button className="back-btn" onClick={onBack}>
          ← Back to Dashboard
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Date</th>
            <th>Attendees</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{event.title}</td>
              <td>{event.date}</td>
              <td>{event.attendees}</td>
              <td>
                <button className="edit-btn">Edit</button>
                <button className="delete-btn">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="add-btn">+ Add New Event</button>
    </div>
  );
};

export default AdminEvents;