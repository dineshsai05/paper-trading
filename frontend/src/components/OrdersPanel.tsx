import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import type { Order } from "../types";

export function OrdersPanel({ refreshKey }: { refreshKey: number }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const firstLoadRef = useRef(true);

  const reload = async () => {
    try {
      const fresh = await api.orders();

      if (!firstLoadRef.current) {
        const prev = prevStatusRef.current;
        for (const o of fresh) {
          const prevStatus = prev.get(o.id);
          if (prevStatus === "OPEN" && o.status === "FILLED") {
            toast.success(
              `Limit ${o.side} ${o.qty} ${o.symbol} filled at ₹${o.limit_price?.toFixed(2)}`
            );
          }
        }
      }

      prevStatusRef.current = new Map(fresh.map((o) => [o.id, o.status]));
      firstLoadRef.current = false;
      setOrders(fresh);
    } catch {}
  };

  useEffect(() => { reload(); }, [refreshKey]);

  const cancel = async (id: string) => {
    try {
      await api.cancelOrder(id);
      toast.info("Order cancelled");
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel");
    }
  };

  const startEdit = (o: Order) => {
    setEditingId(o.id);
    setEditQty(String(o.qty));
    setEditPrice(o.limit_price ? o.limit_price.toFixed(2) : "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditQty("");
    setEditPrice("");
  };

  const saveEdit = async (original: Order) => {
    const newQty = Number(editQty);
    const newPrice = Number(editPrice);
    if (newQty <= 0 || newPrice <= 0) {
      toast.error("Invalid values");
      return;
    }
    try {
      const updated = await api.modifyOrder(original.id, {
        qty: newQty !== original.qty ? newQty : undefined,
        limit_price: newPrice !== original.limit_price ? newPrice : undefined,
      });

      // Detect unchanged (backend silently refuses invalid modifications)
      if (updated.qty === original.qty && updated.limit_price === original.limit_price) {
        toast.error("Modification rejected (insufficient cash or invalid)");
      } else {
        toast.success("Order modified");
      }
      cancelEdit();
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to modify");
    }
  };

  return (
    <div className="p-4 bg-[#131722] border border-[#1e222d] rounded">
      <div className="text-xs uppercase text-gray-500 mb-2">Orders</div>
      {orders.length === 0 ? (
        <div className="text-xs text-gray-500">No orders yet</div>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {orders.slice().reverse().map((o) => {
              const isEditing = editingId === o.id;
              return (
                <tr key={o.id} className="border-b border-[#1e222d]">
                  <td className="py-1">{o.symbol}</td>
                  <td className={o.side === "BUY" ? "text-green-400" : "text-red-400"}>
                    {o.side}
                  </td>
                  <td className="text-right tabular-nums">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        className="w-14 bg-[#1e222d] text-gray-200 px-1 py-0.5 rounded text-right"
                      />
                    ) : o.qty}
                  </td>
                  <td className="text-right">{o.order_type}</td>
                  <td className="text-right tabular-nums">
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-16 bg-[#1e222d] text-gray-200 px-1 py-0.5 rounded text-right"
                      />
                    ) : (
                      o.limit_price ? o.limit_price.toFixed(2) : "-"
                    )}
                  </td>
                  <td className={`text-right ${
                    o.status === "FILLED" ? "text-green-400" :
                    o.status === "REJECTED" ? "text-red-400" :
                    o.status === "CANCELLED" ? "text-gray-500" : "text-yellow-400"
                  }`}>{o.status}</td>
                  <td className="text-right whitespace-nowrap">
                    {o.status === "OPEN" && !isEditing && (
                      <>
                        <button
                          onClick={() => startEdit(o)}
                          className="text-xs text-gray-400 hover:text-blue-400 mr-2"
                          title="Modify"
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => cancel(o.id)}
                          className="text-xs text-gray-400 hover:text-red-400"
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </>
                    )}
                    {isEditing && (
                      <>
                        <button
                          onClick={() => saveEdit(o)}
                          className="text-xs text-green-400 hover:text-green-300 mr-2"
                        >
                          ✓
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="text-xs text-gray-400 hover:text-gray-200"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}