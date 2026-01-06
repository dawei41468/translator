import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./api";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (code: string) => apiClient.joinRoom(code),
    onSuccess: (data) => {
      console.log('🎯 useJoinRoom onSuccess - navigating to room:', data.roomCode);
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      navigate(`/room/${data.roomCode}`);
    },
    onError: (error: any) => {
      console.error('❌ useJoinRoom onError:', error);
      toast.error(error?.message || t("toast.joinRoomFailed"));
    },
  });
};

// --- User/Auth Hooks ---

export const useMe = () => {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiClient.getMe(),
  });
};

export const useUpdateLanguage = () => {
  const queryClient = useQueryClient();
  const { i18n, t } = useTranslation();
  
  return useMutation({
    mutationFn: (language: string) => apiClient.updateLanguage(language),
    onSuccess: (_, language) => {
      queryClient.invalidateQueries({ queryKey: ["me"] });
      i18n.changeLanguage(language);
      toast.success(t("toast.languageUpdated"));
    },
    onError: (error: any) => {
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
