import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/cn";

// design-system.md §7.1 — Primary CTA (.cta) และ Secondary/Action (.action)
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium leading-[1.4] select-none",
    "transition-colors duration-[180ms] motion-reduce:transition-none",
    "focus-visible:outline-3 focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-offset-2",
  ],
  {
    variants: {
      variant: {
        primary:
          "rounded-[9px] bg-blue text-white hover:bg-blue-hover disabled:cursor-default disabled:hover:bg-blue",
        secondary:
          "rounded-[8px] border border-[#dfe6f0] bg-white text-[#4e627c] hover:border-[#c5d3f4] hover:bg-[#f7f9fd] disabled:cursor-not-allowed disabled:opacity-45",
        danger:
          "rounded-[8px] border border-[#dfe6f0] bg-white text-[#c64c45] hover:border-[#c5d3f4] hover:bg-[#f7f9fd] disabled:cursor-not-allowed disabled:opacity-45",
        ghost:
          "rounded-[7px] bg-transparent text-[#a0adc1] hover:bg-blue-soft hover:text-blue aria-pressed:bg-blue-soft aria-pressed:text-blue disabled:cursor-not-allowed disabled:opacity-45",
      },
      size: {
        lg: "min-h-12 px-[31px] py-[15px] text-[17px]",
        md: "min-h-11 px-5 py-[11px] text-[14px]",
        sm: "min-h-9 p-[9px] text-[13px]",
        icon: "size-[34px] p-0",
      },
    },
    compoundVariants: [{ variant: "secondary", size: "md", class: "px-3" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** render เป็น element ลูก (เช่น <Link>) แทน <button> */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        // ปุ่มในฟอร์มต้องไม่ submit โดยไม่ตั้งใจ
        {...(asChild ? {} : { type: type ?? "button" })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export interface IconButtonProps extends Omit<ButtonProps, "size" | "aria-label"> {
  /** ปุ่มไอคอนไม่มีข้อความ จึงบังคับ aria-label ภาษาไทย */
  "aria-label": string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "ghost", ...props }, ref) => <Button ref={ref} variant={variant} size="icon" {...props} />,
);
IconButton.displayName = "IconButton";
