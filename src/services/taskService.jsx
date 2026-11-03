import { supabase } from "../lib/supabase";

//Get all tasks from the user (RLS handles user filtering automatically)
export const getTasks = async () => {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("*, subtasks(*)")
      // No .eq("user_id", user.id) needed - RLS handles this automatically
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching tasks: ", error);
    throw error;
  }
};

//Create a new task
export const createTask = async (taskData, userId) => {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .insert([
        {
          ...taskData,
          user_id: userId, // Use passed user ID
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error creating task:", error);
    throw error;
  }
};

//Update a task
export const updateTask = async (taskId, updates) => {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error updating task:", error);
    throw error;
  }
};

//Delete a task
export const deleteTask = async (taskId) => {
  try {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .select("id")
      .single();

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error deleting task: ", error);
    throw error;
  }
};

// get all subtasks for the task
export const getSubtasks = async (taskId) => {
  try {
    const { data, error } = await supabase
      .from("subtasks")
      .select()
      .eq("task_id", taskId); // Select this parent's children; RLS still enforces ownership.

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error("Error fetching subtasks: ", error);
    throw error;
  }
};

//Create a new subtask
export const createSubtask = async (taskId, subtaskData) => {
  try {
    const { data, error } = await supabase
      .from("subtasks")
      .insert([
        {
          ...subtaskData,
          task_id: taskId,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error creating subtask: ", error);
    throw error;
  }
};

//update a subtask
export const updateSubtask = async (subtaskId, updates) => {
  try {
    const { data, error } = await supabase
      .from("subtasks")
      .update(updates)
      .eq("id", subtaskId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Error updating subtask:", error);
    throw error;
  }
};

//delete a subtask
export const deleteSubtask = async (subtaskId) => {
  try {
    const { error } = await supabase
      .from("subtasks")
      .delete()
      .eq("id", subtaskId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error deleting subtask: ", error);
    throw error;
  }
};

// Save the editor as one database transaction. IDs stay stable when retrying.
export const saveTask = async (draft, isNew = false) => {
  if (!draft.title.trim()) throw new Error("Task title is required");
  if (draft.subtasks.some((sub) => !sub.title.trim())) {
    throw new Error("Enter a title for each subtask, or remove the empty row");
  }
  if (!!draft.reminderDate !== !!draft.reminderClock) {
    throw new Error("Set both reminder date and time, or clear both");
  }
  const { data, error } = await supabase.rpc("save_task", {
    p_task_id: draft.id,
    p_is_new: isNew,
    p_task: {
      title: draft.title.trim(),
      description: draft.description || "",
      priority: draft.priority,
      reminder_date: draft.reminderDate || null,
      reminder_time: draft.reminderClock || null,
      repeat_option: draft.repeatOption || null,
    },
    p_subtasks: draft.subtasks.map((sub) => ({
      id: sub.id,
      title: sub.title.trim(),
      is_completed: !!sub.isCompleted,
    })),
  });
  if (error) {
    if (error.code === "PGRST202") {
      throw new Error("Task saving is not configured yet. Run database/migrations/20261103_task_save.sql in Supabase SQL Editor.");
    }
    throw error;
  }
  if (!data?.id) throw new Error("The server did not return the saved task. Retry to confirm.");
  return data;
};
