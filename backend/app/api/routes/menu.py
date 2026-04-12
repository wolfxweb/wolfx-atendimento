from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from uuid import UUID

from app.database import get_db
from app.models.models import MenuItem
from app.schemas.schemas import MenuItemCreate, MenuItemUpdate, MenuItemResponse

router = APIRouter(prefix="/menu", tags=["menu"])


def menu_item_to_response(item: MenuItem) -> MenuItemResponse:
    return MenuItemResponse(
        id=item.id,
        category=item.category,
        title=item.title,
        href=item.href,
        icon=item.icon,
        order=item.order,
        is_active=item.is_active,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("", response_model=List[MenuItemResponse])
def get_menu_items(db: Session = Depends(get_db)):
    """Get all menu items, ordered by category and order."""
    items = db.query(MenuItem).filter(MenuItem.is_active == True).order_by(MenuItem.category, MenuItem.order).all()
    return [menu_item_to_response(item) for item in items]


@router.post("", response_model=MenuItemResponse, status_code=status.HTTP_201_CREATED)
def create_menu_item(data: MenuItemCreate, db: Session = Depends(get_db)):
    """Create a new menu item."""
    item = MenuItem(
        category=data.category,
        title=data.title,
        href=data.href,
        icon=data.icon,
        order=data.order,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return menu_item_to_response(item)


@router.put("/{item_id}", response_model=MenuItemResponse)
def update_menu_item(item_id: UUID, data: MenuItemUpdate, db: Session = Depends(get_db)):
    """Update a menu item."""
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
    
    db.commit()
    db.refresh(item)
    return menu_item_to_response(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_menu_item(item_id: UUID, db: Session = Depends(get_db)):
    """Delete a menu item."""
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    
    db.delete(item)
    db.commit()
    return None


@router.post("/bulk", response_model=List[MenuItemResponse], status_code=status.HTTP_201_CREATED)
def create_menu_items(bulk_data: List[MenuItemCreate], db: Session = Depends(get_db)):
    """Create multiple menu items at once (for initial setup)."""
    created = []
    for data in bulk_data:
        item = MenuItem(
            category=data.category,
            title=data.title,
            href=data.href,
            icon=data.icon,
            order=data.order,
        )
        db.add(item)
        created.append(item)
    
    db.commit()
    for item in created:
        db.refresh(item)
    
    return [menu_item_to_response(item) for item in created]
