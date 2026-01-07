import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./api";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  return useMutation({
    mutationFn: () => apiClient.createRoom(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success(t("toast.roomCreated"));
    },
    onError: (error: any) => {
      toast.error(error?.message || t("toast.createRoomFailed"));
    },
  });
};

export const useJoinRoom = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (code: string) => apiClient.joinRoom(code),
    onSuccess: (data) => {
      // Immediately update the rooms cache with the joined room data
      queryClient.setQueryData(['rooms'], (oldData: any) => {
        // If we have old data, merge the new room; otherwise create new array
        const rooms = oldData || [];
        const existingIndex = rooms.findIndex((room: any) => room.code === data.roomCode);
        if (existingIndex >= 0) {
          // Update existing room
          rooms[existingIndex] = { ...rooms[existingIndex], ...data };
        } else {
          // Add new room
          rooms.push(data);
        }
        return rooms;
      });

      // Use window.location for full page navigation - most reliable
      const targetUrl = `/room/${data.roomCode}`;
      window.location.href = targetUrl;
    },
    onError: (error: any) => {
      console.error('❌ useJoinRoom onError:', error);
      toast.error(error?.message || t("toast.joinRoomFailed"));
    }
  });
};

// --- User/Auth Hooks ---

export const useUpdateLanguage = () => {
  const queryClient = useQueryClient();
  const { i18n, t } = useTranslation();

  return useMutation({
    mutationFn: (language: string) => {
      console.log('useUpdateLanguage mutationFn called with:', language);
      return apiClient.updateLanguage(language);
    },
    onSuccess: async (_, language) => {
      console.log('useUpdateLanguage onSuccess called, invalidating queries and changing i18n to:', language);
      // Await the invalidation to ensure user data is updated before changing language
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      i18n.changeLanguage(language);
      toast.success(t("toast.languageUpdated"));
    },
    onError: (error: any) => {
      console.error('useUpdateLanguage onError:', error);
      toast.error(error?.message || t("toast.updateLanguageFailed"));
    },
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (data: { name?: string; language?: string }) => apiClient.updateMe(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success(t("toast.profileUpdated"));
    },
    onError: (error: any) => {
      toast.error(error?.message || t("toast.updateProfileFailed"));
    },
  });
};
