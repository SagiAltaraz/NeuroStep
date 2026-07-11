import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface CompanionPresentationValue {
  isInstructionAvatarVisible: boolean;
  showInstructionAvatar: () => void;
  hideInstructionAvatar: () => void;
  isResultAvatarVisible: boolean;
  showResultAvatar: () => void;
  hideResultAvatar: () => void;
}

const CompanionPresentationContext = createContext<CompanionPresentationValue | undefined>(undefined);

export function CompanionPresentationProvider({ children }: { children: ReactNode }) {
  const [isInstructionAvatarVisible, setIsInstructionAvatarVisible] = useState(false);
  const [isResultAvatarVisible, setIsResultAvatarVisible] = useState(false);
  const showInstructionAvatar = useCallback(() => setIsInstructionAvatarVisible(true), []);
  const hideInstructionAvatar = useCallback(() => setIsInstructionAvatarVisible(false), []);
  const showResultAvatar = useCallback(() => setIsResultAvatarVisible(true), []);
  const hideResultAvatar = useCallback(() => setIsResultAvatarVisible(false), []);
  const value = useMemo(
    () => ({
      isInstructionAvatarVisible,
      showInstructionAvatar,
      hideInstructionAvatar,
      isResultAvatarVisible,
      showResultAvatar,
      hideResultAvatar,
    }),
    [
      isInstructionAvatarVisible,
      showInstructionAvatar,
      hideInstructionAvatar,
      isResultAvatarVisible,
      showResultAvatar,
      hideResultAvatar,
    ],
  );

  return (
    <CompanionPresentationContext.Provider value={value}>
      {children}
    </CompanionPresentationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCompanionPresentation() {
  const context = useContext(CompanionPresentationContext);
  if (!context) {
    throw new Error(
      'useCompanionPresentation must be used within <CompanionPresentationProvider>',
    );
  }
  return context;
}
