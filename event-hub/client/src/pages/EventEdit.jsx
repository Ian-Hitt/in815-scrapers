import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteEvent, fetchEvent, updateEvent } from "../api.js";
import EventForm from "../components/EventForm.jsx";

export default function EventEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const { data: event, isLoading, error: loadError } = useQuery({
    queryKey: ["event", id],
    queryFn: () => fetchEvent(id),
  });

  const remove = useMutation({
    mutationFn: () => deleteEvent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate("/");
    },
  });

  const update = useMutation({
    mutationFn: (data) => updateEvent(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate(`/events/${id}`);
    },
    onError: (err) => setError(err.message),
  });

  if (isLoading) return <p className="text-gray-500 dark:text-surface-400">Loading...</p>;
  if (loadError) return <p className="text-red-600 dark:text-red-400">Error: {loadError.message}</p>;
  if (!event) return <p className="dark:text-surface-300">Not found</p>;

  return (
    <div>
      <Link to={`/events/${id}`} className="text-sm text-blue-600 dark:text-surface-200 hover:underline dark:hover:text-accent-300 mb-4 inline-flex items-center gap-1 py-1">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to event
      </Link>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold dark:text-surface-100">Edit event</h1>
        <button
          onClick={() => { if (confirm("Delete this event?")) remove.mutate(); }}
          className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 cursor-pointer"
        >
          Delete event
        </button>
      </div>
      <EventForm
        initialEvent={event}
        onSubmit={(data) => { setError(null); update.mutate(data); }}
        onCancel={() => navigate(`/events/${id}`)}
        submitLabel="Save changes"
        isSubmitting={update.isPending}
        error={error}
      />
    </div>
  );
}
