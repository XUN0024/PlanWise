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
    const { error } = await supabase.from("tasks").delete().eq("id", taskId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Error deleting task: ", error);
    throw error;
  }
};

// get all subtasks for the task
//TODO: add rls for task table
export const getSubtasks = async (taskId) => {
  try {
    const { data, error } = await supabase
      .from("subtasks")
      .select()
      .eq("task_id", taskId); // remove this after rls

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
