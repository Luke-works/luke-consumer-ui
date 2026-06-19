import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ColumnDef } from "@tanstack/react-table";
import DataTable, { type ManualTable } from "./DataTable";

type Row = { name: string };
const columns: ColumnDef<Row, unknown>[] = [{ id: "name", header: "Name", accessorKey: "name" }];

function manual(over: Partial<ManualTable> = {}): ManualTable {
  return {
    pageIndex: 0,
    pageSize: 2,
    rowCount: 10,
    onPageChange: vi.fn(),
    sorting: [],
    onSortingChange: vi.fn(),
    search: "",
    onSearchChange: vi.fn(),
    ...over,
  };
}

describe("DataTable manual (server-driven) mode (#26)", () => {
  it("reports the server total + page count, not the local row count", () => {
    render(<DataTable columns={columns} data={[{ name: "a" }, { name: "b" }]} manual={manual()} />);
    expect(screen.getByText(/Showing 1.*2 of 10/)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 5/)).toBeInTheDocument();
  });

  it("asks the parent to change page instead of paginating locally", async () => {
    const onPageChange = vi.fn();
    render(<DataTable columns={columns} data={[{ name: "a" }, { name: "b" }]} manual={manual({ onPageChange })} />);
    await userEvent.click(screen.getByLabelText("Next page"));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("reports header-sort clicks to the parent", async () => {
    const onSortingChange = vi.fn();
    render(<DataTable columns={columns} data={[{ name: "a" }]} manual={manual({ onSortingChange })} />);
    await userEvent.click(screen.getByRole("button", { name: /Name/ }));
    expect(onSortingChange).toHaveBeenCalled();
  });

  it("debounces the search box before notifying the parent", () => {
    vi.useFakeTimers();
    try {
      const onSearchChange = vi.fn();
      render(<DataTable columns={columns} data={[{ name: "a" }]} manual={manual({ onSearchChange })} />);
      fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "abc" } });
      expect(onSearchChange).not.toHaveBeenCalled(); // still within the debounce window
      act(() => { vi.advanceTimersByTime(300); });
      expect(onSearchChange).toHaveBeenCalledWith("abc");
    } finally {
      vi.useRealTimers();
    }
  });
});
