import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./api";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

// --- Room Hooks ---

export const useRoom = (code: string | undefined) => {
  return useQuery({
    queryKey: ["room", code],
    queryFn: () => apiClient.getRoom(code!),
    enabled: !!code,
  });
};

export const useCreateRoom = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.createRoom(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success("Room created!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create room");
    },
  });
};

export const useJoinRoom = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (code: string) => apiClient.joinRoom(code),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      navigate(`/room/${data.roomCode}`);
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to join room");
    },
  });
};

// --- User/Auth Hooks ---

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; language?: string }) => apiClient.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile updated");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update profile");
    },
  });
};
