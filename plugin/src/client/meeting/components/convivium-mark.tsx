import type { ReactElement } from "react";
import logoSvg from "./convivium-logo.svg";
import styles from "./convivium-mark.module.css";

const logoSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;

export const ConviviumMark = (): ReactElement => (
    <img className={styles.mark} src={logoSrc} alt="" aria-hidden="true" />
);
