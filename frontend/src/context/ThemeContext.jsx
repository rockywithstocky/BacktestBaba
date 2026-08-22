import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Mode options: 'dark' | 'light' | 'system'
    const [theme, setThemeState] = useState(() => {
        return localStorage.getItem('app_theme') || 'dark';
    });

    const [effectiveTheme, setEffectiveTheme] = useState('dark');

    const setTheme = (newTheme) => {
        setThemeState(newTheme);
        localStorage.setItem('app_theme', newTheme);
    };

    useEffect(() => {
        const root = document.documentElement;

        const updateTheme = () => {
            let active = theme;
            if (theme === 'system') {
                const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                active = systemPrefersDark ? 'dark' : 'light';
            }

            setEffectiveTheme(active);

            // Apply attributes to html tag
            root.setAttribute('data-theme', active);
            if (active === 'light') {
                root.classList.add('light');
                root.classList.remove('dark');
            } else {
                root.classList.add('dark');
                root.classList.remove('light');
            }
        };

        updateTheme();

        // Listen for OS system theme changes if set to system
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => updateTheme();
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
