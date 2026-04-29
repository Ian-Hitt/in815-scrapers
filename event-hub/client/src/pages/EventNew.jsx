import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createEvent } from "../api.js";
import EventForm from "../components/EventForm.jsx";

export default function EventNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const create = useMutation({
    mutationFn: (data) => createEvent(data),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate(`/events/${event.id}`);
    },
    onError: (err) => setError(err.message),
  });

  return (
    <div>
      <Link to="/" className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-flex items-center gap-1 py-1">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to events
      </Link>
      <h1 className="text-2xl font-bold dark:text-surface-100 mb-4">New event</h1>
      <EventForm
        onSubmit={(data) => { setError(null); create.mutate(data); }}
        onCancel={() => navigate("/")}
        submitLabel="Create event"
        isSubmitting={create.isPending}
        error={error}
      />
    </div>
  );
}
