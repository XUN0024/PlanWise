import { supabase } from "./supabase";
import { useAuth } from "../contexts/AuthContext";

const MyComponent = () => {
  const { user } = useAuth(); // Get user from context

  const handleCreateTask = async (taskData) => {
    // Pass user ID to service
    await createTask(taskData, user.id);
  };
};

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
